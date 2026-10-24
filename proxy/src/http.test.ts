import assert from "node:assert/strict";
import { test } from "node:test";

import type { BookRequest, JobView } from "./contract.ts";
import { fakeModel, fakeSearch } from "./fakes.ts";
import { route, type Jobs } from "./http.ts";
import { createBookJob, type BookJob } from "./job.ts";
import { createRateLimiter, HOUR_MS, type Limiter } from "./limiter.ts";
import { createMeter } from "./meter.ts";
import { memoryStore } from "./store.ts";

const BASE = "https://mood-read-proxy.example.workers.dev";
const book: BookRequest = { title: "Dracula", author: "Bram Stoker", chapters: ["Chapter 1", "Chapter 2"] };

function memoryJobs(opts: { limiter?: Limiter; rescoreMinAgeMs?: number } = {}) {
  const meter = createMeter(memoryStore());
  const jobs = new Map<string, BookJob>();
  const search = fakeSearch();
  const model = fakeModel();
  const jobFor = (key: string) => {
    if (!jobs.has(key)) jobs.set(key, createBookJob({ store: memoryStore(), meter, capUsd: 20, search, model, limiter: opts.limiter, rescoreMinAgeMs: opts.rescoreMinAgeMs ?? 0 }));
    return jobs.get(key)!;
  };
  const api: Jobs = {
    start: async (key, b, rescore, client) => {
      const out = await jobFor(key).start(key, b, rescore, { client });
      return "refused" in out ? out : out.view;
    },
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

const from = (ip: string) => ({ "content-type": "application/json", "cf-connecting-ip": ip });

test("past a client's limit a new book is a 429 with Retry-After; a cached book still answers (A34)", async () => {
  const limiter = createRateLimiter(memoryStore(), { perClient: 2, global: 30, windowMs: HOUR_MS });
  const { api, jobFor, search } = memoryJobs({ limiter });
  const made = (n: number) => ({ ...book, title: `Made Up ${n}` });

  const first = (await (await route(post("/v1/score", made(1), from("203.0.113.7")), () => api)).json()) as JobView;
  assert.equal((await route(post("/v1/score", made(2), from("203.0.113.7")), () => api)).status, 200);
  const before = search.queries.length;
  const over = await route(post("/v1/score", made(3), from("203.0.113.7")), () => api);
  assert.equal(over.status, 429);
  const seconds = Number(over.headers.get("retry-after"));
  assert.ok(seconds >= 1 && seconds <= 3600, "Retry-After is the seconds left in the hour");
  assert.equal(over.headers.get("access-control-allow-origin"), "*");
  assert.match(over.headers.get("access-control-expose-headers") ?? "", /retry-after/i, "the web build can read it");
  const body = (await over.json()) as { error: string; reason: string; retryAfterSeconds: number };
  assert.equal(body.reason, "client-limit");
  assert.equal(body.retryAfterSeconds, seconds);
  assert.equal(search.queries.length, before, "a refused book is never researched");

  assert.equal((await route(post("/v1/score", made(3), from("198.51.100.2")), () => api)).status, 200, "another client is unaffected");

  const job = jobFor(first.jobId);
  while ((await job.step()).more);
  const cached = await route(post("/v1/score", made(1), from("203.0.113.7")), () => api);
  assert.equal(cached.status, 200, "a cached book is served past the limit and never counts");
  assert.equal(((await cached.json()) as JobView).state, "done");
});

test("rescoring a fresh result is a 429 until it is old enough (A34)", async () => {
  const { api, jobFor } = memoryJobs({ rescoreMinAgeMs: 7 * 86_400_000 });
  const started = (await (await route(post("/v1/score", book), () => api)).json()) as JobView;
  const job = jobFor(started.jobId);
  while ((await job.step()).more);
  const re = await route(post("/v1/rescore", book), () => api);
  assert.equal(re.status, 429);
  assert.equal(((await re.json()) as { reason: string }).reason, "rescore-too-soon");
  assert.ok(Number(re.headers.get("retry-after")) > 6 * 86_400, "about seven days");
});
