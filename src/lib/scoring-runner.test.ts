// The app's scoring job against the real proxy code in memory (proxy/src/http.ts and job.ts with fake OpenAI and
// Brave clients): start, poll, store per chapter, resume after a restart, rescore, the cap, and an unreachable proxy.
import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeModel, fakeSearch } from "../../proxy/src/fakes.ts";
import { route, type Jobs } from "../../proxy/src/http.ts";
import { createBookJob, type BookJob } from "../../proxy/src/job.ts";
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
function proxy(cap = 20) {
  const meter = createMeter(memoryStore());
  const jobs = new Map<string, BookJob>();
  const search = fakeSearch();
  const model = fakeModel({ thin: ["Opening Credits"] });
  const jobFor = (key: string) => {
    if (!jobs.has(key)) jobs.set(key, createBookJob({ store: memoryStore(), meter, capUsd: cap, search, model }));
    return jobs.get(key)!;
  };
  const api: Jobs = {
    start: async (key, b, rescore) => (await jobFor(key).start(key, b, rescore)).view,
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
};

function app(p: ReturnType<typeof proxy>, kv = mapKv()) {
  const store = createScoringStore(kv);
  const timers = manualTimers();
  const runner = createScoringRunner({ api: createScoringApi(BASE, p.fetchImpl), store, timers, now: () => 1000 });
  return { kv, store, timers, runner };
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
