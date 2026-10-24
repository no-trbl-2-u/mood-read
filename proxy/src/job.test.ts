import assert from "node:assert/strict";
import { test } from "node:test";

import type { BookRequest } from "./contract.ts";
import { fakeModel, fakeSearch, type FakeModelOptions } from "./fakes.ts";
import { createBookJob, MAX_ATTEMPTS, type Run } from "./job.ts";
import { createMeter, monthOf, type Meter } from "./meter.ts";
import { memoryStore, type Store } from "./store.ts";
import { bookKey } from "./validate.ts";

const NOW = Date.UTC(2026, 9, 23, 12);
const book: BookRequest = {
  title: "Dracula",
  author: "Bram Stoker",
  chapters: ["Opening Credits", "Chapter 1", "Chapter 2", "Chapter 3"],
};

type Setup = { store?: Store; meter?: Meter; cap?: number; model?: FakeModelOptions; now?: () => number };

function setup(s: Setup = {}) {
  const store = s.store ?? memoryStore();
  const meter = s.meter ?? createMeter(memoryStore());
  const search = fakeSearch();
  const model = fakeModel(s.model);
  const job = createBookJob({ store, meter, capUsd: s.cap ?? 20, search, model, now: s.now ?? (() => NOW) });
  return { store, meter, search, model, job };
}

async function drain(job: ReturnType<typeof createBookJob>, limit = 200) {
  const seen: { step: number; steps: number }[] = [];
  for (let i = 0; i < limit; i++) {
    const { more } = await job.step();
    const v = (await job.status()).view;
    if (v) seen.push({ step: v.progress.step, steps: v.progress.steps });
    if (!more) return seen;
  }
  throw new Error("job never finished");
}

test("a book is researched from its title, author and chapter titles, then scored chapter by chapter (A13, A14, A19)", async () => {
  const { job, search, model, meter } = setup({ model: { thin: ["Opening Credits"] } });
  const key = await bookKey(book);
  const started = await job.start(key, book);
  assert.equal(started.run, true);
  assert.equal(started.view.state, "running");
  assert.deepEqual(started.view.progress.chaptersDone, 0);

  const seen = await drain(job);
  assert.ok(seen.every((p, i) => i === 0 || p.step >= seen[i - 1].step), "progress only moves forward");

  const { view } = await job.status();
  assert.equal(view?.state, "done");
  const result = view!.result!;
  assert.equal(result.key, key);
  assert.equal(result.chapters.length, 4);

  // Every query is built from the book's own words; nothing else about anyone reaches the search engine.
  assert.ok(search.queries.length > 0);
  assert.ok(search.queries.every((q) => q.includes('"Dracula"')));

  const [credits, ...scored] = result.chapters;
  assert.equal(credits.mood.coverage, "too-little", "too little written: unscored, not guessed");
  assert.deepEqual(credits.mood.emotions, []);
  assert.equal(credits.pieces, null);

  for (const ch of scored) {
    assert.equal(ch.mood.coverage, "scored");
    assert.deepEqual(ch.mood.emotions.map((e) => e.emotion), ["tension", "dread"]);
    assert.ok(ch.mood.emotions.every((e) => e.intensity > 0 && e.intensity <= 1));
    assert.ok(ch.mood.sources.length > 0 && ch.mood.sources.every((s) => /^https:\/\//.test(s.url)), "emotions cite their sources");
    assert.equal(ch.mood.model, "gpt-5-mini");
    assert.ok(ch.mood.version);
    assert.equal(ch.mood.scoredAt, NOW);
    const p = ch.pieces!;
    assert.ok(p.piece.title && p.piece.artist && ["score", "instrumental", "ambient"].includes(p.piece.kind));
    assert.ok(p.alternates.length >= 2, "at least two alternates");
    for (const piece of [p.piece, ...p.alternates]) {
      assert.equal(piece.vocals, "none");
      assert.ok(piece.moodTags.some((t) => ch.mood.emotions.some((e) => e.emotion === t)), "mood tags match the chapter's emotions");
      assert.doesNotMatch(piece.title, /Sung|Song/, "a piece the model flagged or the screen caught is never named (A20)");
    }
    assert.ok(!p.alternates.some((a) => a.id === p.piece.id));
  }

  // Stored results keep findings and links only: no search snippets, no events.
  const text = JSON.stringify(result);
  assert.doesNotMatch(text, /What readers say|A review touching/);
  assert.ok(model.calls.some((c) => c.name === "vocals_check"), "every piece passes a second vocals check");
  assert.ok(result.costUsd > 0);
  assert.equal(Math.round((await meter.spent(monthOf(NOW))) * 1e6), Math.round(result.costUsd * 1e6), "every paid call is metered");
});

test("the run's search snippets are dropped once it is done", async () => {
  const { job, store } = setup();
  await job.start(await bookKey(book), book);
  await drain(job);
  const run = (await store.get<Run>("job"))!;
  assert.deepEqual(run.sources, []);
  assert.deepEqual(run.queries, []);
});

test("a scored book returns from the cache for any listener, with no new run (A22)", async () => {
  const shared = memoryStore();
  const first = setup({ store: shared });
  const key = await bookKey(book);
  await first.job.start(key, book);
  await drain(first.job);

  const second = setup({ store: shared });
  const again = await second.job.start(key, book);
  assert.equal(again.run, false);
  assert.equal(again.view.state, "done");
  assert.equal(again.view.result?.chapters.length, 4);
  assert.equal(second.search.queries.length, 0);
  assert.equal(second.model.calls.length, 0);
});

test("a second start while a run is going returns the run, never a second one", async () => {
  const { job } = setup();
  const key = await bookKey(book);
  await job.start(key, book);
  await job.step();
  const again = await job.start(key, book);
  assert.equal(again.run, false);
  assert.equal(again.view.state, "running");
  assert.ok(again.view.progress.step >= 1);
});

test("rescoring is explicit: a new run even for a cached book, and the old result stays until it lands (A13)", async () => {
  const { job, search } = setup();
  const key = await bookKey(book);
  await job.start(key, book);
  await drain(job);
  const before = search.queries.length;

  const re = await job.start(key, book, true);
  assert.equal(re.run, true);
  assert.equal(re.view.state, "running");
  const mid = await job.status();
  assert.equal(mid.view?.state, "running");
  await drain(job);
  assert.ok(search.queries.length > before);
  assert.equal((await job.status()).view?.state, "done");
});

test("at the monthly cap no new run starts; cached books still return; the run starts itself next month (A22)", async () => {
  let now = NOW;
  const meter = createMeter(memoryStore());
  await meter.add(monthOf(NOW), 20);

  const cached = memoryStore();
  const warm = setup({ store: cached, now: () => now });
  const key = await bookKey(book);
  // Scored earlier in the month, before the cap was reached.
  await warm.job.start(key, book);
  await drain(warm.job);

  const capped = setup({ meter, now: () => now });
  const out = await capped.job.start(key, book);
  assert.equal(out.run, false);
  assert.equal(out.view.state, "capped");
  assert.equal((await capped.job.step()).more, false, "a capped job runs nothing");
  assert.equal(capped.search.queries.length + capped.model.calls.length, 0);
  assert.equal((await capped.job.status()).view?.state, "capped");

  const stillServed = setup({ store: cached, meter, now: () => now });
  assert.equal((await stillServed.job.start(key, book)).view.state, "done", "a cached book returns at the cap");

  now = Date.UTC(2026, 10, 1, 0, 5);
  const resumed = await capped.job.status();
  assert.equal(resumed.run, true);
  assert.equal(resumed.view?.state, "running");
  await drain(capped.job);
  assert.equal((await capped.job.status()).view?.state, "done");
});

test("the cap stops new runs, not one already going", async () => {
  const meter = createMeter(memoryStore());
  const { job } = setup({ meter, cap: 0.03 });
  await job.start(await bookKey(book), book);
  await drain(job);
  assert.equal((await job.status()).view?.state, "done");
  assert.ok((await meter.spent(monthOf(NOW))) > 0.03);
  const next = setup({ meter, cap: 0.03 });
  assert.equal((await next.job.start(await bookKey({ ...book, title: "Carmilla" }), { ...book, title: "Carmilla" })).view.state, "capped");
});

test("a vocal piece is never named: when too few pass the vocals checks, the chapter names none and is unscored (A20)", async () => {
  const { job } = setup({ model: { clean: 4, vocalByCheck: [] } });
  await job.start(await bookKey(book), book);
  await drain(job);
  const ok = (await job.status()).view!.result!;
  assert.ok(ok.chapters.every((c) => c.pieces === null || c.pieces.alternates.length >= 2));

  // The second check rejects every clean candidate: nothing is left, so nothing is named.
  const titles: string[] = [];
  for (let ch = 1; ch <= 4; ch++) for (let round = 1; round <= 2; round++) for (let k = 1; k <= 4; k++) titles.push(`Theme ${ch}.${round}.${k}`);
  const strict = setup({ model: { clean: 4, vocalByCheck: titles } });
  await strict.job.start(await bookKey(book), book);
  await drain(strict.job);
  const none = (await strict.job.status()).view!.result!;
  for (const c of none.chapters) {
    assert.equal(c.pieces, null);
    assert.equal(c.mood.coverage, "too-little");
    assert.deepEqual(c.mood.emotions, []);
  }
});

test("too few candidates in the first round asks again, excluding what passed", async () => {
  const { job, model } = setup({ model: { clean: 2 } });
  await job.start(await bookKey(book), book);
  await drain(job);
  const asks = model.calls.filter((c) => c.name === "chapter_pieces");
  assert.ok(asks.length >= 2);
  assert.match(asks[asks.length - 1].user, /Do not suggest: Theme/);
  const result = (await job.status()).view!.result!;
  for (const c of result.chapters.filter((x) => x.mood.coverage === "scored")) assert.ok(c.pieces!.alternates.length >= 2);
});

test("a failing step is retried, then the run is marked failed; a new start runs it again", async () => {
  const flaky = setup({ model: { failOnCall: 1 } });
  const key = await bookKey(book);
  await flaky.job.start(key, book);
  await drain(flaky.job);
  assert.equal((await flaky.job.status()).view?.state, "done", "one failure is retried");

  const store = memoryStore();
  const broken = createBookJob({
    store,
    meter: createMeter(memoryStore()),
    capUsd: 20,
    search: { search: async () => Promise.reject(new Error("down")) },
    model: fakeModel(),
    now: () => NOW,
  });
  await broken.start(key, book);
  for (let i = 0; i < MAX_ATTEMPTS; i++) await broken.step();
  assert.equal((await broken.status()).view?.state, "failed");
  assert.equal((await broken.step()).more, false);
  const again = await broken.start(key, book);
  assert.equal(again.run, true);
  assert.equal(again.view.state, "running");
});

test("an unknown job has no status", async () => {
  const { job } = setup();
  assert.equal((await job.status()).view, null);
});
