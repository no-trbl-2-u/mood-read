import assert from "node:assert/strict";
import { test } from "node:test";

import type { BookRequest, JobView } from "./contract.ts";
import { fakeModel, fakeSearch, memoryVerdicts } from "./fakes.ts";
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

// ---- POST /v1/verdicts and the job view's order (07.5, A6) ----

const row = { pieceId: "composer-1--theme-1", emotions: ["tension", "dread"], verdict: "fits" };

test("POST /v1/verdicts counts the rows and answers 204 with CORS; the store holds counts only", async () => {
  const { api } = memoryJobs();
  const v = memoryVerdicts();
  const res = await route(post("/v1/verdicts", { rows: [row, { ...row, verdict: "misfit" }, { ...row, emotions: ["dread", "tension"] }] }), () => api, () => v);
  assert.equal(res.status, 204);
  assert.equal(await res.text(), "");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await v.counts([row.pieceId]), { [row.pieceId]: { "tension,dread": { fits: 2, misfits: 1 } } });
  assert.deepEqual(v.store.keys(), [`verdicts:${row.pieceId}`]);
});

test("a verdict body with any field beyond rows of pieceId, emotions and verdict is a 400, and nothing is counted", async () => {
  const { api } = memoryJobs();
  const v = memoryVerdicts();
  for (const body of [{ rows: [row], bookId: "b" }, { rows: [{ ...row, chapterIndex: 2 }] }, { rows: [{ ...row, at: 1 }] }, { rows: [{ ...row, deviceId: "d" }] }, { rows: [] }]) {
    assert.equal((await route(post("/v1/verdicts", body), () => api, () => v)).status, 400, JSON.stringify(body));
  }
  assert.equal((await route(post("/v1/verdicts", { rows: [row] }, { "content-type": "text/plain" }), () => api, () => v)).status, 415);
  assert.equal((await route(post("/v1/verdicts", "{nope"), () => api, () => v)).status, 400);
  assert.deepEqual(v.store.keys(), []);
});

test("verdict posts are rate-limited per client (429), apart from /v1/score", async () => {
  const { api } = memoryJobs();
  const v = memoryVerdicts({ perClient: 2, global: 1000, windowMs: 60_000 });
  const from = (ip: string) => post("/v1/verdicts", { rows: [row] }, { "content-type": "application/json", "cf-connecting-ip": ip });
  assert.equal((await route(from("1.1.1.1"), () => api, () => v)).status, 204);
  assert.equal((await route(from("1.1.1.1"), () => api, () => v)).status, 204);
  assert.equal((await route(from("1.1.1.1"), () => api, () => v)).status, 429);
  assert.equal((await route(from("2.2.2.2"), () => api, () => v)).status, 204, "another client is not held back");
  assert.equal((await route(post("/v1/score", book, { "content-type": "application/json", "cf-connecting-ip": "1.1.1.1" }), () => api, () => v)).status, 200, "scoring is not limited by it");
  assert.deepEqual(await v.counts([row.pieceId]), { [row.pieceId]: { "tension,dread": { fits: 3, misfits: 0 } } });
});

test("without verdict storage, POST /v1/verdicts is a 503 and job views keep the scorer's order", async () => {
  const { api } = memoryJobs();
  assert.equal((await route(post("/v1/verdicts", { rows: [row] }), () => api)).status, 503);
});

test("a job view orders each chapter's alternates by the verdicts, demoting a two-to-one misfit; the piece stays", async () => {
  const { api, jobFor } = memoryJobs();
  const v = memoryVerdicts({ perClient: 100, global: 1000, windowMs: 60_000 });
  const started = (await (await route(post("/v1/score", book), () => api, () => v)).json()) as JobView;
  const job = jobFor(started.jobId);
  while ((await job.step()).more);
  const plain = (await (await route(new Request(`${BASE}/v1/jobs/${started.jobId}`), () => api, () => v)).json()) as JobView;
  const c0 = plain.result!.chapters[0];
  const emotions = c0.mood.emotions.map((e) => e.emotion);
  const [first, second] = c0.pieces!.alternates;
  assert.ok(first && second, "two alternates at least");
  // The scorer's first alternate gathers misfits two to one over twelve; its second, a few fits.
  const rows = [
    ...Array.from({ length: 8 }, () => ({ pieceId: first.id, emotions, verdict: "misfit" })),
    ...Array.from({ length: 4 }, () => ({ pieceId: first.id, emotions, verdict: "fits" })),
    ...Array.from({ length: 2 }, () => ({ pieceId: second.id, emotions, verdict: "fits" })),
  ];
  assert.equal((await route(post("/v1/verdicts", { rows }), () => api, () => v)).status, 204);
  const after = (await (await route(new Request(`${BASE}/v1/jobs/${started.jobId}`), () => api, () => v)).json()) as JobView;
  const a0 = after.result!.chapters[0].pieces!;
  assert.equal(a0.alternates[0].id, second.id, "the best-kept piece first");
  assert.equal(a0.alternates[a0.alternates.length - 1].id, first.id, "the demoted piece last");
  assert.deepEqual(a0.alternates.map((p) => p.id).sort(), c0.pieces!.alternates.map((p) => p.id).sort(), "no piece removed");
  assert.equal(a0.piece.id, c0.pieces!.piece.id);
  // The cached answer to /v1/score is ordered the same way.
  const cached = (await (await route(post("/v1/score", book), () => api, () => v)).json()) as JobView;
  assert.deepEqual(cached.result!.chapters[0].pieces!.alternates.map((p) => p.id), a0.alternates.map((p) => p.id));
});

test("when the counts cannot be read, the job view goes out in the scorer's order", async () => {
  const { api, jobFor } = memoryJobs();
  const started = (await (await route(post("/v1/score", book), () => api)).json()) as JobView;
  const job = jobFor(started.jobId);
  while ((await job.step()).more);
  const broken = { ...memoryVerdicts(), counts: async () => Promise.reject(new Error("storage down")) };
  const res = await route(new Request(`${BASE}/v1/jobs/${started.jobId}`), () => api, () => broken);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as JobView).state, "done");
});

test("a result cached before v2 goes out on the catalog, from POST /v1/score and GET /v1/jobs/:id alike, with no new run (05.3, A3)", async () => {
  const { CATALOG } = await import("./catalog.ts");
  const ids = new Set(CATALOG.map((p) => p.id));
  const old = { id: "composer-1--theme-1", title: "Theme 1", artist: "Composer 1", kind: "score" as const, vocals: "none" as const, moodTags: ["tension" as const] };
  const key = "b".repeat(64);
  const cached: JobView = {
    jobId: key,
    state: "done",
    progress: { step: 1, steps: 1, chaptersDone: 1, chapters: 1 },
    result: {
      key,
      chapters: [
        {
          index: 0,
          title: "Chapter 1",
          mood: { chapterIndex: 0, chapterTitle: "Chapter 1", emotions: [{ emotion: "tension", intensity: 0.8 }], sources: [], coverage: "scored", model: "gpt-5-mini", version: "07.1.0", scoredAt: 1 },
          pieces: { piece: old, alternates: [{ ...old, id: "composer-2--theme-2" }, { ...old, id: "composer-3--theme-3" }] },
        },
      ],
      model: "gpt-5-mini",
      version: "07.1.0",
      scoredAt: 1,
      costUsd: 0.1,
    },
  };
  let starts = 0;
  const api: Jobs = { start: async () => (starts++, cached), status: async () => cached };
  for (const req of [post("/v1/score", book), new Request(`${BASE}/v1/jobs/${key}`)]) {
    const view = (await (await route(req, () => api, () => memoryVerdicts())).json()) as JobView;
    const p = view.result!.chapters[0].pieces!;
    assert.ok([p.piece, ...p.alternates].every((x) => ids.has(x.id)), "every piece a catalog piece");
    assert.deepEqual(p.reference, old, "the old named piece is the reference");
  }
  assert.equal(starts, 1, "the cached book was read, never researched again");
});
