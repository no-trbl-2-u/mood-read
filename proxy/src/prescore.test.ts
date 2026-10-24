// Pre-scoring's rules (05.10, A11) on their own and inside a book's job: the half-cap budget, the owner's token check,
// the overall emotions and the index Browse reads. No network: the paid services are fakes (fakes.ts).
import assert from "node:assert/strict";
import { test } from "node:test";

import type { BookRequest, BookResult, ChapterResult } from "./contract.ts";
import { fakeModel, fakeSearch } from "./fakes.ts";
import { createBookJob } from "./job.ts";
import { createMeter, monthOf } from "./meter.ts";
import {
  createOverallIndex,
  MIN_TOKEN_LENGTH,
  overallEmotions,
  ownerAuthorized,
  parseIds,
  PRESCORE_BUCKET,
  PRESCORE_STEP_RESERVE_USD,
  prescoreBudget,
} from "./prescore.ts";
import { memoryStore } from "./store.ts";
import { bookKey } from "./validate.ts";

const NOW = Date.UTC(2026, 9, 24, 12);
const MONTH = monthOf(NOW);
const CAP = 20;
const HALF = CAP / 2;
const R = PRESCORE_STEP_RESERVE_USD;
const book: BookRequest = { title: "Dracula", author: "Bram Stoker", chapters: ["Chapter 1", "Chapter 2", "Chapter 3"], librivoxId: "1234" };

function setup(meter = createMeter(memoryStore()), onFinish?: Parameters<typeof createBookJob>[0]["onFinish"]) {
  const store = memoryStore();
  const search = fakeSearch();
  const model = fakeModel();
  const job = createBookJob({ store, meter, capUsd: CAP, search, model, now: () => NOW, onFinish });
  return { store, meter, search, model, job };
}

async function drain(job: ReturnType<typeof createBookJob>) {
  for (let i = 0; i < 200; i++) if (!(await job.step()).more) return;
  throw new Error("job never stopped");
}

// ---- the budget ----

test("the meter keeps pre-scoring's share apart and inside the month's total", async () => {
  const meter = createMeter(memoryStore());
  await meter.add(MONTH, 2);
  await meter.add(MONTH, 3, PRESCORE_BUCKET);
  assert.equal(await meter.spent(MONTH), 5, "the total holds every run's spend");
  assert.equal(await meter.spent(MONTH, PRESCORE_BUCKET), 3, "the share holds only pre-scoring's");
});

test("pre-scoring may spend up to half the cap and no further; a step needs its reserve to fit", async () => {
  const meter = createMeter(memoryStore());
  assert.equal((await prescoreBudget(meter, CAP, NOW)).open, true);
  await meter.add(MONTH, HALF - R - 0.01, PRESCORE_BUCKET);
  assert.equal((await prescoreBudget(meter, CAP, NOW)).open, true, "room for one more step");
  await meter.add(MONTH, 0.02, PRESCORE_BUCKET);
  const b = await prescoreBudget(meter, CAP, NOW);
  assert.equal(b.open, false, "blocked before the step that could reach 50%");
  assert.equal(b.halfUsd, HALF);
  assert.ok(b.prescoreUsd < HALF);
  assert.equal((await prescoreBudget(meter, CAP, Date.UTC(2026, 10, 1))).open, true, "a new month opens it again");
});

test("pre-scoring never pushes the total over the cap, even with its own half unspent", async () => {
  const meter = createMeter(memoryStore());
  await meter.add(MONTH, CAP - R + 0.01); // listeners have spent nearly everything
  const b = await prescoreBudget(meter, CAP, NOW);
  assert.equal(b.prescoreUsd, 0);
  assert.equal(b.open, false);
});

test("a pre-score run is refused at the half; a listener's run still starts, up to the whole cap", async () => {
  const meter = createMeter(memoryStore());
  await meter.add(MONTH, HALF, PRESCORE_BUCKET);
  const pre = setup(meter);
  const key = await bookKey(book);
  const out = await pre.job.start(key, book, false, { prescore: true });
  assert.equal(out.view.state, "capped");
  assert.equal(out.run, false);
  assert.equal((await pre.job.step()).more, false, "a capped pre-score job runs nothing");
  assert.equal(pre.search.queries.length + pre.model.calls.length, 0);

  const listener = setup(meter);
  const mine = await listener.job.start(await bookKey({ ...book, title: "Carmilla" }), { ...book, title: "Carmilla" });
  assert.equal(mine.view.state, "running", "the listener's half is untouched");
  await drain(listener.job);
  assert.equal((await listener.job.status()).view?.state, "done");
  assert.equal(await meter.spent(MONTH, PRESCORE_BUCKET), HALF, "a listener's run bills nothing to pre-scoring");
  assert.ok((await meter.spent(MONTH)) > HALF);

  await meter.add(MONTH, CAP);
  const late = setup(meter);
  assert.equal((await late.job.start(await bookKey({ ...book, title: "Ruthven" }), { ...book, title: "Ruthven" })).view.state, "capped", "past the whole cap even a listener waits");
});

test("a pre-score run is billed to pre-scoring, and pauses mid-way (keeping its progress) once its half is near", async () => {
  const meter = createMeter(memoryStore());
  await meter.add(MONTH, HALF - R - 0.01, PRESCORE_BUCKET);
  const { job, store, search } = setup(meter);
  const key = await bookKey(book);
  assert.equal((await job.start(key, book, false, { prescore: true })).view.state, "running");
  await drain(job);
  const paused = (await job.status()).view!;
  assert.equal(paused.state, "capped", "the run waits rather than spend past the half");
  assert.ok(paused.progress.step > 0, "it got some way first");
  const pre = await meter.spent(MONTH, PRESCORE_BUCKET);
  assert.ok(pre > HALF - R - 0.01, "its spend went to pre-scoring's share");
  assert.ok(pre <= HALF, "and never past half the cap");
  assert.equal(pre, await meter.spent(MONTH), "all of it");

  // A listener asks for the same book: they take the run over, it resumes where it stopped, billed as theirs.
  const queriesBefore = search.queries.length;
  const takeover = await job.start(key, { ...book, librivoxId: undefined });
  assert.equal(takeover.view.state, "running");
  assert.equal(takeover.run, true);
  assert.ok(takeover.view.progress.step >= paused.progress.step, "progress kept");
  await drain(job);
  assert.equal((await job.status()).view?.state, "done");
  assert.ok(search.queries.length >= queriesBefore);
  assert.equal(await meter.spent(MONTH, PRESCORE_BUCKET), pre, "the listener's part bills nothing to pre-scoring");
  assert.ok((await meter.spent(MONTH)) > pre);
  assert.ok(store.keys().includes("result"));
});

test("a listener asking for a book mid pre-score takes the running run over", async () => {
  const meter = createMeter(memoryStore());
  const { job } = setup(meter);
  const key = await bookKey(book);
  await job.start(key, book, false, { prescore: true });
  await job.step();
  const pre = await meter.spent(MONTH, PRESCORE_BUCKET);
  assert.ok(pre > 0);
  await job.start(key, book); // the listener's own /v1/score
  await meter.add(MONTH, HALF, PRESCORE_BUCKET); // pre-scoring's half now spent
  await drain(job);
  assert.equal((await job.status()).view?.state, "done", "the listener's run is not paused at pre-scoring's half");
  assert.equal(await meter.spent(MONTH, PRESCORE_BUCKET), pre + HALF);
});

test("a finished run tells the index whether it was a pre-score run", async () => {
  const told: { key: string; prescore: boolean; librivoxId?: string }[] = [];
  const { job } = setup(createMeter(memoryStore()), async (done) => {
    told.push({ key: done.key, prescore: done.prescore, librivoxId: done.book.librivoxId });
  });
  const key = await bookKey(book);
  await job.start(key, book, false, { prescore: true });
  await drain(job);
  assert.deepEqual(told, [{ key, prescore: true, librivoxId: "1234" }]);
});

test("a failing index never fails the run", async () => {
  const { job } = setup(createMeter(memoryStore()), async () => {
    throw new Error("index down");
  });
  await job.start(await bookKey(book), book, false, { prescore: true });
  await drain(job);
  assert.equal((await job.status()).view?.state, "done");
});

// ---- the owner's token ----

test("only the owner's exact token may pre-score; a missing or short secret refuses everyone", () => {
  const token = "t".repeat(MIN_TOKEN_LENGTH) + "-owner";
  assert.equal(ownerAuthorized(`Bearer ${token}`, token), true);
  assert.equal(ownerAuthorized(null, token), false, "no header");
  assert.equal(ownerAuthorized(`Bearer ${token}x`, token), false, "wrong token");
  assert.equal(ownerAuthorized(`Bearer ${token.slice(1)}`, token), false);
  assert.equal(ownerAuthorized(token, token), false, "not a bearer header");
  assert.equal(ownerAuthorized(`Bearer ${token}`, undefined), false, "the Worker has no token set");
  assert.equal(ownerAuthorized("Bearer short", "short"), false, "a short secret guards nothing");
  assert.equal(ownerAuthorized("Bearer ", ""), false);
});

// ---- the overall emotions ----

const chapter = (index: number, emotions: { emotion: string; intensity: number }[], coverage: "scored" | "too-little" = "scored"): ChapterResult =>
  ({
    index,
    title: `Secret chapter title ${index}`,
    mood: {
      chapterIndex: index,
      chapterTitle: `Secret chapter title ${index}`,
      emotions,
      scenes: [{ emotions, span: 1 }],
      sources: [{ url: `https://spoilers.example/${index}`, title: "What happens" }],
      coverage,
      model: "m",
      version: "v",
      scoredAt: 1,
    },
    pieces: null,
  }) as ChapterResult;

test("a book's overall emotions: the top three by mean intensity over its scored chapters", () => {
  const result = {
    chapters: [
      chapter(0, [{ emotion: "dread", intensity: 0.9 }, { emotion: "tension", intensity: 0.6 }]),
      chapter(1, [{ emotion: "dread", intensity: 0.7 }, { emotion: "sorrow", intensity: 0.4 }]),
      chapter(2, [], "too-little"),
      chapter(3, [{ emotion: "calm", intensity: 1 }, { emotion: "joy", intensity: 0.1 }]),
    ],
  };
  // Over three scored chapters: dread 1.6/3, tension 0.6/3, sorrow 0.4/3, calm 1/3, joy 0.1/3.
  assert.deepEqual(overallEmotions(result), [
    { emotion: "dread", intensity: 0.53 },
    { emotion: "calm", intensity: 0.33 },
    { emotion: "tension", intensity: 0.2 },
  ]);
  assert.deepEqual(overallEmotions({ chapters: [chapter(0, [], "too-little")] }), [], "nothing scored, no overall mood");
});

test("the overall emotions and the index carry nothing of any chapter", async () => {
  const result = { chapters: [chapter(0, [{ emotion: "dread", intensity: 0.9 }]), chapter(1, [{ emotion: "wonder", intensity: 0.5 }])] } as Pick<BookResult, "chapters">;
  const overall = overallEmotions(result);
  for (const e of overall) assert.deepEqual(Object.keys(e).sort(), ["emotion", "intensity"]);

  const index = createOverallIndex(memoryStore());
  // Even a report carrying more than emotions is rebuilt from emotion and intensity alone.
  await index.put({ librivoxId: "1234", key: "k1", emotions: overall.map((e) => ({ ...e, chapterTitle: "Secret chapter title 0" })) as never, prescore: true });
  const view = await index.get(["1234", "999"]);
  assert.deepEqual(view, { books: { "1234": { emotions: overall } } }, "an unscored book returns nothing");
  const text = JSON.stringify(view);
  assert.doesNotMatch(text, /Secret|spoilers|What happens|chapter|scenes|sources|pieces/i);
});

test("the index holds pre-scored books only; a later run of the same book refreshes it", async () => {
  const index = createOverallIndex(memoryStore());
  const dread = [{ emotion: "dread" as const, intensity: 0.8 }];
  const joy = [{ emotion: "joy" as const, intensity: 0.6 }];
  await index.put({ librivoxId: "77", key: "listener-book", emotions: dread, prescore: false });
  assert.deepEqual(await index.get(["77"]), { books: {} }, "a listener's own book is never listed");
  await index.put({ librivoxId: "77", key: "k", emotions: dread, prescore: true });
  await index.put({ librivoxId: "77", key: "other", emotions: joy, prescore: false });
  assert.deepEqual((await index.get(["77"])).books["77"].emotions, dread, "another book's run changes nothing");
  await index.put({ librivoxId: "77", key: "k", emotions: joy, prescore: false });
  assert.deepEqual((await index.get(["77"])).books["77"].emotions, joy, "a rescore of the same book refreshes it");
  await index.put({ librivoxId: "77", key: "k", emotions: [], prescore: true });
  assert.deepEqual(await index.get(["77"]), { books: {} }, "a rescore with nothing scored drops it");
});

test("Browse's ids: digits only, deduplicated, at most fifty", () => {
  assert.deepEqual(parseIds("1,2,2, 3"), { ok: true, ids: ["1", "2", "3"] });
  assert.equal(parseIds("").ok, false);
  assert.equal(parseIds(null).ok, false);
  assert.equal(parseIds("1,abc").ok, false);
  assert.equal(parseIds("01").ok, false);
  assert.equal(parseIds(Array.from({ length: 51 }, (_, i) => String(i + 1)).join(",")).ok, false);
});
