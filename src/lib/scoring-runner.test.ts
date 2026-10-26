// The app's scoring job against the real proxy code in memory (proxy/src/http.ts and job.ts with fake OpenAI and
// Brave clients): start, poll, store per chapter, resume after a restart, rescore, the cap, and an unreachable proxy.
import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeModel, fakeSearch } from "../../proxy/src/fakes.ts";
import { route, type Jobs } from "../../proxy/src/http.ts";
import { createBookJob, type BookJob } from "../../proxy/src/job.ts";
import type { Refusal } from "../../proxy/src/limiter.ts";
import { createMeter, monthOf } from "../../proxy/src/meter.ts";
import { memoryStore } from "../../proxy/src/store.ts";
import type { Kv } from "./library-store.ts";
import { createScoringApi } from "./scoring-api.ts";
import { createScoringRunner, POLL_MS } from "./scoring-runner.ts";
import { createScoringStore } from "./scoring-store.ts";
import type { Book } from "./types.ts";

const BASE = "https://scoring.example";

function mapKv(): Kv & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

/** The proxy in memory. Each request is answered by the real handler; steps run when the test says so. */
function proxy(cap = 20, rescoreMinAgeMs = 0) {
  const meter = createMeter(memoryStore());
  const jobs = new Map<string, BookJob>();
  const search = fakeSearch();
  const model = fakeModel({ thin: ["Opening Credits"] });
  const jobFor = (key: string) => {
    // No rescore minimum age by default: these tests rescore at once; the proxy's own tests hold the limits (A34).
    if (!jobs.has(key)) jobs.set(key, createBookJob({ store: memoryStore(), meter, capUsd: cap, search, model, rescoreMinAgeMs }));
    return jobs.get(key)!;
  };
  // A limit the test switches on: the next starts are refused as the limiter would (client-limit, global-limit).
  let refuse: Refusal | null = null;
  const api: Jobs = {
    start: async (key, b, rescore, client) => {
      if (refuse) return { refused: refuse };
      const out = await jobFor(key).start(key, b, rescore, { client });
      return "refused" in out ? out : out.view;
    },
    status: async (key) => (jobs.has(key) ? (await jobFor(key).status()).view : null),
  };
  const bodies: unknown[] = [];
  let down = false;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    if (down) throw new TypeError("network down");
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    return route(new Request(url, init), () => api);
  };
  return {
    fetchImpl,
    bodies,
    meter,
    search,
    setDown: (d: boolean) => (down = d),
    setRefuse: (r: Refusal | null) => (refuse = r),
    async finishAll() {
      for (const j of jobs.values()) while ((await j.step()).more);
    },
  };
}

function manualTimers() {
  const queue = new Map<number, { fn: () => void; ms: number }>();
  let id = 0;
  return {
    queue,
    set: (fn: () => void, ms: number) => {
      queue.set(++id, { fn, ms });
      return id;
    },
    clear: (h: unknown) => void queue.delete(h as number),
    async fire() {
      const all = [...queue.entries()];
      queue.clear();
      for (const [, t] of all) t.fn();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

const book: Book = {
  id: "book-1",
  title: "Dracula",
  author: "Bram Stoker",
  narrator: "Someone Reading",
  cover: "cover-ref",
  files: [{ ref: "file:///private/dracula.m4b", name: "dracula.m4b", duration: 300 }],
  chapters: ["Opening Credits", "Chapter 1", "Chapter 2"].map((title, index) => ({ bookId: "book-1", index, title, fileIndex: 0, start: index * 100, end: index * 100 + 100 })),
  duration: 300,
  addedAt: 1,
  lastPlayedAt: 2,
  source: { kind: "import" },
  onDevice: true,
};

function app(p: ReturnType<typeof proxy>, kv = mapKv(), clock = { t: 1000 }) {
  const store = createScoringStore(kv);
  const timers = manualTimers();
  const now = () => clock.t;
  const runner = createScoringRunner({ api: createScoringApi(BASE, p.fetchImpl, now), store, timers, now });
  return { kv, store, timers, runner, clock };
}

test("starting sends only the title, author and chapter titles; progress is stored; done stores each chapter (A13, A15)", async () => {
  const p = proxy();
  const a = app(p);
  await a.runner.start(book);
  assert.deepEqual(p.bodies, [{ title: "Dracula", author: "Bram Stoker", chapters: ["Opening Credits", "Chapter 1", "Chapter 2"] }]);
  const job = a.store.job(book.id)!;
  assert.equal(job.state, "running");
  assert.match(job.jobId!, /^[0-9a-f]{64}$/);
  assert.equal(job.progress.chapters, 3);
  assert.equal([...a.timers.queue.values()][0].ms, POLL_MS);

  await p.finishAll();
  await a.timers.fire();
  assert.equal(a.store.job(book.id), null, "a finished job is forgotten");
  const scores = a.store.scores(book.id)!;
  assert.equal(scores.chapters.length, 3);
  const credits = a.store.chapterScore(book.id, book.chapters[0])!;
  assert.equal(credits.mood.coverage, "too-little");
  assert.equal(credits.playlist, null);
  const ch1 = a.store.chapterScore(book.id, book.chapters[1])!;
  assert.equal(ch1.mood.coverage, "scored");
  assert.ok(ch1.mood.emotions.length > 0 && ch1.mood.sources.length > 0);
  assert.equal(ch1.playlist!.pick, "auto");
  assert.ok(ch1.playlist!.alternates.length >= 2);
  assert.ok(ch1.pieces.some((x) => x.id === ch1.playlist!.piece));
  assert.equal(a.timers.queue.size, 0, "nothing polls once done");
});

test("the job survives the app closing: a new app session resumes it from the stored id (A15)", async () => {
  const p = proxy();
  const kv = mapKv();
  const first = app(p, kv);
  await first.runner.start(book);
  first.runner.stop(book.id); // the app closes

  await p.finishAll(); // the proxy keeps working meanwhile

  const second = app(p, kv); // the app opens again
  second.runner.resumeAll([book]);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(second.store.job(book.id), null);
  assert.equal(second.store.scores(book.id)?.chapters.length, 3);
});

test("a book is scored once: a second listener's start returns the proxy's cache with no new research (A22)", async () => {
  const p = proxy();
  const a = app(p);
  await a.runner.start(book);
  await p.finishAll();
  await a.timers.fire();
  const searches = p.search.queries.length;

  const other = app(p);
  await other.runner.start(book);
  assert.equal(other.store.scores(book.id)?.chapters.length, 3, "done straight away from the cache");
  assert.equal(p.search.queries.length, searches);
});

test("rescore is explicit and keeps the stored scores until the new ones land (A13)", async () => {
  const p = proxy();
  const a = app(p);
  await a.runner.start(book);
  await p.finishAll();
  await a.timers.fire();
  const before = a.store.scores(book.id)!;

  await a.runner.start(book, true);
  assert.equal(a.store.job(book.id)?.state, "running");
  assert.equal(a.store.job(book.id)?.rescore, true);
  assert.deepEqual(a.store.scores(book.id), before, "the old scores stay meanwhile");
  assert.deepEqual(Object.keys(p.bodies.at(-1) as object), ["title", "author", "chapters"]);
  await p.finishAll();
  await a.timers.fire();
  assert.equal(a.store.job(book.id), null);
});

test("at the cap the job waits as capped and polls slowly; the chapters still play unscored meanwhile", async () => {
  const p = proxy(20);
  await p.meter.add(monthOf(Date.now()), 25);
  const a = app(p);
  await a.runner.start(book);
  assert.equal(a.store.job(book.id)?.state, "capped");
  assert.equal(a.store.scores(book.id), null);
  assert.ok([...a.timers.queue.values()][0].ms > POLL_MS);
});

test("an unreachable proxy leaves the job marked unreachable with its id kept, and polling backs off", async () => {
  const p = proxy();
  const a = app(p);
  p.setDown(true);
  await a.runner.start(book);
  assert.equal(a.store.job(book.id)?.state, "unreachable");
  assert.equal(a.store.job(book.id)?.jobId, null);

  p.setDown(false);
  await a.runner.start(book);
  const id = a.store.job(book.id)!.jobId;
  p.setDown(true);
  await a.timers.fire();
  assert.equal(a.store.job(book.id)?.jobId, id, "the job id survives a dropped poll");
  assert.ok([...a.timers.queue.values()][0].ms > POLL_MS);
  p.setDown(false);
  await p.finishAll();
  await a.timers.fire();
  assert.equal(a.store.scores(book.id)?.chapters.length, 3);
});

test("a chapter renamed after scoring no longer shows the old score", async () => {
  const p = proxy();
  const a = app(p);
  await a.runner.start(book);
  await p.finishAll();
  await a.timers.fire();
  assert.ok(a.store.chapterScore(book.id, book.chapters[1]));
  assert.equal(a.store.chapterScore(book.id, { index: 1, title: "Renamed" }), null);
  a.store.forget(book.id);
  assert.equal(a.store.scores(book.id), null);
  assert.equal(a.kv.map.size, 0);
});

test("a rescore that waits at the cap still hands over the proxy's cached result to a device without it (A22)", async () => {
  const p = proxy(20);
  const a = app(p);
  await a.runner.start(book);
  await p.finishAll();
  await a.timers.fire();
  await p.meter.add(monthOf(Date.now()), 100);

  const other = app(p);
  await other.runner.start(book, true);
  assert.equal(other.store.job(book.id)?.state, "capped", "the rescore waits");
  assert.equal(other.store.scores(book.id)?.chapters.length, 3, "the cached chapters are kept meanwhile");
  other.runner.stop(book.id);

  const later = app(p, other.kv);
  later.store.forget(book.id);
  later.store.saveJob(book.id, { ...other.store.job(book.id)!, state: "capped" });
  later.runner.resume(book);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(later.store.job(book.id)?.state, "capped");
  assert.equal(later.store.scores(book.id)?.chapters.length, 3, "a status poll hands it over too");
});

// ---- "try later" (01.25, A38) ----

test("A38: a busy proxy (429) leaves the book waiting until Retry-After, not unreachable, and nothing polls", async () => {
  const p = proxy();
  const a = app(p);
  p.setRefuse({ reason: "client-limit", retryAfterMs: 40 * 60_000 });
  await a.runner.start(book);
  const job = a.store.job(book.id)!;
  assert.equal(job.state, "waiting");
  assert.equal(job.waitReason, "client-limit");
  assert.equal(job.waitUntil, 1000 + 40 * 60_000);
  assert.equal(job.rescore, false);
  assert.equal(a.timers.queue.size, 0, "a waiting book is not polled");
  assert.equal(p.bodies.length, 1);
});

test("A38: starting again before the time waits instead of calling the proxy, also after a reload; after it, it goes", async () => {
  const p = proxy();
  const kv = mapKv();
  const clock = { t: 1000 };
  const first = app(p, kv, clock);
  p.setRefuse({ reason: "global-limit", retryAfterMs: 10 * 60_000 });
  await first.runner.start(book);
  p.setRefuse(null);
  const waiting = first.store.job(book.id);

  clock.t += 5 * 60_000;
  await first.runner.start(book);
  assert.equal(p.bodies.length, 1, "no second request before the time");
  assert.deepEqual(first.store.job(book.id), waiting, "still waiting, unchanged");

  const second = app(p, kv, clock); // the app opens again
  assert.equal(second.store.job(book.id)?.state, "waiting", "the wait survives a reload");
  second.runner.resumeAll([book]);
  await second.runner.start(book);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(p.bodies.length, 1, "nor after a reload");

  clock.t = waiting!.waitUntil!;
  await second.runner.start(book);
  assert.equal(p.bodies.length, 2, "at the time, it goes");
  assert.equal(second.store.job(book.id)?.state, "running");
  assert.equal(second.store.job(book.id)?.waitUntil, undefined);
});

test("A38: a rescore of a result still too young waits with rescore-too-soon; the scores stay and a plain start still works", async () => {
  const p = proxy(20, 7 * 86_400_000);
  const a = app(p);
  await a.runner.start(book);
  await p.finishAll();
  await a.timers.fire();
  const scores = a.store.scores(book.id);
  assert.ok(scores);

  await a.runner.start(book, true);
  const job = a.store.job(book.id)!;
  assert.equal(job.state, "waiting");
  assert.equal(job.waitReason, "rescore-too-soon");
  assert.equal(job.rescore, true);
  assert.ok(job.waitUntil! > 1000 + 6 * 86_400_000, "about a week out");
  assert.deepEqual(a.store.scores(book.id), scores, "the moods stay");

  const sent = p.bodies.length;
  await a.runner.start(book, true);
  assert.equal(p.bodies.length, sent, "a rescore before the time is not sent");
});

test("A38: a book waiting on an earlier run keeps that run's id and progress", async () => {
  const p = proxy();
  const a = app(p);
  await a.runner.start(book);
  const id = a.store.job(book.id)!.jobId;
  a.runner.stop(book.id);
  p.setRefuse({ reason: "client-limit", retryAfterMs: 60_000 });
  a.clock.t += 1;
  // An unreachable job the listener retries: the proxy says try later.
  a.store.saveJob(book.id, { ...a.store.job(book.id)!, state: "unreachable" });
  await a.runner.start(book);
  assert.equal(a.store.job(book.id)?.state, "waiting");
  assert.equal(a.store.job(book.id)?.jobId, id);
});

test("A26: dismissing an unreachable error clears the stored job, also after a restart, and a later start works", async () => {
  const p = proxy();
  const a = app(p);
  p.setDown(true);
  await a.runner.start(book);
  assert.equal(a.store.job(book.id)?.state, "unreachable");
  a.runner.dismiss(book.id);
  assert.equal(a.store.job(book.id), null);
  // A restart over the same storage finds nothing to show or resume.
  const b = app(p, a.kv);
  assert.equal(b.store.job(book.id), null);
  p.setDown(false);
  await b.runner.start(book);
  assert.equal(b.store.job(book.id)?.state, "running");
});

test("A26: dismissing a failed job stops its polling; a running, capped or waiting job is not dismissable", async () => {
  const p = proxy();
  const a = app(p);
  await a.runner.start(book);
  assert.equal(a.store.job(book.id)?.state, "running");
  a.runner.dismiss(book.id);
  assert.equal(a.store.job(book.id)?.state, "running", "a running job is left alone");
  const running = a.store.job(book.id)!;
  a.store.saveJob(book.id, { ...running, state: "failed" });
  a.runner.dismiss(book.id);
  assert.equal(a.store.job(book.id), null);
  assert.equal(a.runner.isPolling(book.id), false);
});
