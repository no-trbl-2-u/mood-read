import assert from "node:assert/strict";
import { test } from "node:test";

import type { BookRequest, JobView } from "./contract.ts";
import { fakeModel, fakeSearch } from "./fakes.ts";
import { route, type Jobs } from "./http.ts";
import { createBookJob, type BookJob } from "./job.ts";
import { createMeter } from "./meter.ts";
import { memoryStore } from "./store.ts";

const BASE = "https://mood-read-proxy.example.workers.dev";
const book: BookRequest = { title: "Dracula", author: "Bram Stoker", chapters: ["Chapter 1", "Chapter 2"] };

function memoryJobs() {
  const meter = createMeter(memoryStore());
  const jobs = new Map<string, BookJob>();
  const search = fakeSearch();
  const model = fakeModel();
  const jobFor = (key: string) => {
    if (!jobs.has(key)) jobs.set(key, createBookJob({ store: memoryStore(), meter, capUsd: 20, search, model }));
    return jobs.get(key)!;
  };
  const api: Jobs = {
    start: async (key, b, rescore) => (await jobFor(key).start(key, b, rescore)).view,
    status: async (key) => (jobs.has(key) ? (await jobFor(key).status()).view : null),
  };
  return { api, jobFor, search };
}

const post = (path: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request(`${BASE}${path}`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

test("GET /health answers ok; unknown paths are 404", async () => {
  const { api } = memoryJobs();
  const ok = await route(new Request(`${BASE}/health`), () => api);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "ok");
  for (const r of [new Request(`${BASE}/`), new Request(`${BASE}/score`), new Request(`${BASE}/health`, { method: "POST" })]) {
    assert.equal((await route(r, () => api)).status, 404);
  }
});

test("CORS: the web build may call it; a preflight answers 204", async () => {
  const { api } = memoryJobs();
  const res = await route(new Request(`${BASE}/v1/score`, { method: "OPTIONS" }), () => api);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("access-control-allow-headers") ?? "", /content-type/);
});

test("POST /v1/score starts the book's job; GET /v1/jobs/:id reports progress, then the scored chapters", async () => {
  const { api, jobFor } = memoryJobs();
  const res = await route(post("/v1/score", book), () => api);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  const started = (await res.json()) as JobView;
  assert.equal(started.state, "running");
  assert.match(started.jobId, /^[0-9a-f]{64}$/);

  const job = jobFor(started.jobId);
  while ((await job.step()).more);
  const done = (await (await route(new Request(`${BASE}/v1/jobs/${started.jobId}`), () => api)).json()) as JobView;
  assert.equal(done.state, "done");
  assert.equal(done.result?.chapters.length, 2);

  const cached = (await (await route(post("/v1/score", book), () => api)).json()) as JobView;
  assert.equal(cached.state, "done", "the same book returns from the cache");
  const re = (await (await route(post("/v1/rescore", book), () => api)).json()) as JobView;
  assert.equal(re.state, "running", "rescore is its own explicit call");
});

test("a body with anything beyond title, author, chapter titles and the catalog numbers is refused with 400 (A22)", async () => {
  const { api, search } = memoryJobs();
  for (const extra of [{ deviceId: "d-1" }, { position: 12 }, { listener: "me" }]) {
    const res = await route(post("/v1/score", { ...book, ...extra }), () => api);
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as { error: string }).error, /only title, author, chapters, librivoxId and gutenbergId/);
  }
  for (const extra of [{ gutenbergId: "pg1342" }, { librivoxId: 253 }]) {
    assert.equal((await route(post("/v1/score", { ...book, ...extra }), () => api)).status, 400);
  }
  assert.equal(search.queries.length, 0);
});

test("non-JSON, the wrong content type and oversized bodies are refused", async () => {
  const { api } = memoryJobs();
  assert.equal((await route(post("/v1/score", "{nope"), () => api)).status, 400);
  assert.equal((await route(post("/v1/score", book, { "content-type": "text/plain" }), () => api)).status, 415);
  const big = { ...book, chapters: Array.from({ length: 300 }, () => "x".repeat(299)) };
  assert.equal((await route(post("/v1/score", big), () => api)).status, 413);
});

test("an unknown or malformed job id is a 404", async () => {
  const { api } = memoryJobs();
  assert.equal((await route(new Request(`${BASE}/v1/jobs/${"a".repeat(64)}`), () => api)).status, 404);
  assert.equal((await route(new Request(`${BASE}/v1/jobs/..%2Fsecrets`), () => api)).status, 404);
});
