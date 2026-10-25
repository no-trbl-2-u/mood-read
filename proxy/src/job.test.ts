import assert from "node:assert/strict";
import { test } from "node:test";

import type { BookRequest } from "./contract.ts";
import type { CompletionRequest, ModelClient } from "./clients.ts";
import { admitted, fakeModel, fakeSearch, type FakeModelOptions } from "./fakes.ts";
import { createBookJob, MAX_ATTEMPTS, type BookJob, type Run } from "./job.ts";
import { CATALOG } from "./catalog.ts";
import type { CatalogPiece } from "../../src/lib/catalog.ts";
import { createRateLimiter, DAY_MS, HOUR_MS, type Limiter } from "./limiter.ts";
import { BRAVE_USD_PER_QUERY, createMeter, estimateUsage, monthOf, openAiCost, type Meter } from "./meter.ts";
import { memoryStore, type Store } from "./store.ts";
import { bookKey } from "./validate.ts";

const NOW = Date.UTC(2026, 9, 23, 12);
const book: BookRequest = {
  title: "Dracula",
  author: "Bram Stoker",
  chapters: ["Opening Credits", "Chapter 1", "Chapter 2", "Chapter 3"],
};

type Setup = {
  store?: Store;
  meter?: Meter;
  cap?: number;
  model?: FakeModelOptions;
  now?: () => number;
  limiter?: Limiter;
  /** Left out: 0, so the older tests may rescore at once; the minimum age has its own tests. */
  rescoreMinAgeMs?: number;
  /** The catalog pieces are named from; the bundled snapshot unless given (05.3). */
  catalog?: readonly CatalogPiece[];
};

const CATALOG_IDS = new Set(CATALOG.map((p) => p.id));

function setup(s: Setup = {}) {
  const store = s.store ?? memoryStore();
  const meter = s.meter ?? createMeter(memoryStore());
  const search = fakeSearch();
  const model = fakeModel(s.model);
  const rescoreMinAgeMs = "rescoreMinAgeMs" in s ? s.rescoreMinAgeMs : 0;
  const raw = createBookJob({ store, meter, capUsd: s.cap ?? 20, search, model, now: s.now ?? (() => NOW), limiter: s.limiter, rescoreMinAgeMs, catalog: s.catalog });
  return { store, meter, search, model, job: admitted(raw), raw };
}

async function drain(job: Pick<BookJob, "step" | "status">, limit = 200) {
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
    assert.ok(p.alternates.length >= 2 && p.alternates.length <= 4, "two to four alternates");
    for (const piece of [p.piece, ...p.alternates, ...(p.scenePieces ?? [])]) {
      assert.ok(CATALOG_IDS.has(piece.id), `${piece.id}: every piece named is a catalog piece (05.3, A3)`);
      assert.equal(piece.vocals, "none");
      assert.ok(piece.moodTags.some((t) => ch.mood.emotions.some((e) => e.emotion === t)), "mood tags match the chapter's emotions");
    }
    assert.ok(!p.alternates.some((a) => a.id === p.piece.id));
    // The reference (D13): the model's famous piece, through every no-vocals check, never a catalog piece, never played.
    const ref = p.reference!;
    assert.ok(ref, "a reference is kept beside the catalog pick");
    assert.ok(!CATALOG_IDS.has(ref.id), "the reference is never a catalog id");
    assert.ok(![p.piece, ...p.alternates, ...(p.scenePieces ?? [])].some((x) => x.id === ref.id), "the reference is never among the pieces");
    assert.equal(ref.vocals, "none");
    assert.doesNotMatch(ref.title, /Sung|Song/, "a piece the model flagged or the screen caught is never named (A20)");
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

test("a vocal piece is never named: when no candidate passes the vocals checks, the chapter has no reference, only its catalog pieces (A20)", async () => {
  const titles: string[] = [];
  for (let ch = 1; ch <= 4; ch++) for (let round = 1; round <= 2; round++) for (let k = 1; k <= 4; k++) titles.push(`Theme ${ch}.${round}.${k}`);
  const strict = setup({ model: { clean: 4, vocalByCheck: titles } });
  await strict.job.start(await bookKey(book), book);
  await drain(strict.job);
  const none = (await strict.job.status()).view!.result!;
  for (const c of none.chapters) {
    assert.equal(c.pieces!.reference, undefined, "nothing passed: no reference");
    assert.ok([c.pieces!.piece, ...c.pieces!.alternates].every((p) => CATALOG_IDS.has(p.id)), "the catalog pieces stand");
  }
  assert.doesNotMatch(JSON.stringify(none), /Theme \d|Sung|Song for/, "no piece the checks refused is named anywhere");
});

test("a chapter with researched emotions the catalog cannot match keeps its emotions and names no piece (A13)", async () => {
  const { job } = setup({ catalog: [] });
  await job.start(await bookKey(book), book);
  await drain(job);
  const result = (await job.status()).view!.result!;
  for (const c of result.chapters) {
    assert.equal(c.pieces, null, "no catalog piece fits: none is named");
    assert.equal(c.mood.coverage, "scored", "the research found enough: not stored as too little written");
    assert.deepEqual(c.mood.emotions.map((e) => e.emotion), ["tension", "dread"]);
    assert.ok(c.mood.sources.length > 0, "the emotions keep their cited sources");
  }
});

test("when no reference passes the first round it asks again, excluding what it offered", async () => {
  const { job, model } = setup({ model: { vocalByCheck: [1, 2, 3, 4].map((n) => `Theme ${n}.1.1`) } });
  await job.start(await bookKey(book), book);
  await drain(job);
  const asks = model.calls.filter((c) => c.name === "chapter_pieces");
  assert.equal(asks.length, 2);
  assert.match(asks[1].user, /Do not suggest: .*Theme \d\.1\.1 by Composer 1/);
  const result = (await job.status()).view!.result!;
  for (const c of result.chapters) assert.match(c.pieces!.reference!.title, /^Theme \d\.2\.1$/);
});

test("the model is asked for three candidates a chapter, the reference alone, with no scene asks (05.3)", async () => {
  const scenes = { "Chapter 1": [{ emotions: [{ emotion: "calm", intensity: 0.6 }], span: 0.5 }, { emotions: [{ emotion: "dread", intensity: 0.9 }], span: 0.5 }] };
  const { job, model } = setup({ model: { scenes } });
  await job.start(await bookKey(book), book);
  await drain(job);
  const ask = model.calls.find((c) => c.name === "chapter_pieces")!;
  assert.match(ask.system, /suggest 3 real, well-known pieces/);
  assert.doesNotMatch(ask.user, /Scenes in order/);
});

test("a failing step is retried, then the run is marked failed; a new start runs it again", async () => {
  const flaky = setup({ model: { failOnCall: 1 } });
  const key = await bookKey(book);
  await flaky.job.start(key, book);
  await drain(flaky.job);
  assert.equal((await flaky.job.status()).view?.state, "done", "one failure is retried");

  const store = memoryStore();
  const broken = admitted(createBookJob({
    store,
    meter: createMeter(memoryStore()),
    capUsd: 20,
    search: { search: async () => Promise.reject(new Error("down")) },
    model: fakeModel(),
    now: () => NOW,
  }));
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

test("a failed or capped rescore still shows the cached result on status, as start does (A22)", async () => {
  const store = memoryStore();
  const meter = createMeter(memoryStore());
  const key = await bookKey(book);
  const first = setup({ store, meter });
  await first.job.start(key, book);
  await drain(first.job);
  const cached = (await first.job.status()).view!.result!;

  // A rescore whose searches keep failing until the run is marked failed.
  const broken = admitted(
    createBookJob({ store, meter, capUsd: 20, search: { search: async () => Promise.reject(new Error("down")) }, model: fakeModel(), now: () => NOW, rescoreMinAgeMs: 0 }),
  );
  await broken.start(key, book, true);
  await drain(broken);
  const failed = (await broken.status()).view!;
  assert.equal(failed.state, "failed", "the rescore's failure is reported");
  assert.deepEqual(failed.result, cached, "the old result stays until a new one lands");
  assert.deepEqual((await broken.start(key, book)).view.result, cached);

  // A rescore asked for at the cap waits, and the cached result stays visible meanwhile.
  await meter.add(monthOf(NOW), 100);
  const capped = setup({ store, meter });
  const re = await capped.job.start(key, book, true);
  assert.equal(re.view.state, "capped");
  assert.deepEqual(re.view.result, cached);
  const polled = (await capped.job.status()).view!;
  assert.equal(polled.state, "capped");
  assert.deepEqual(polled.result, cached);
});

test("a chapter the sources describe as a sequence is scored as ordered scenes with one catalog piece each; the rest have one scene (A1, A3)", async () => {
  const scenes = {
    "Chapter 2": [
      { emotions: [{ emotion: "calm", intensity: 0.6 }], span: 0.4, summary: "a quiet supper at the castle" },
      { emotions: [{ emotion: "tension", intensity: 0.7 }], span: 0.35 },
      { emotions: [{ emotion: "dread", intensity: 0.9 }], span: 0.25 },
    ],
  };
  const { job } = setup({ model: { thin: ["Opening Credits"], scenes } });
  await job.start(await bookKey(book), book);
  await drain(job);
  const result = (await job.status()).view!.result!;
  const [credits, one, two] = result.chapters;

  assert.equal(credits.mood.scenes, undefined, "an unscored chapter has no scenes");

  assert.deepEqual(one.mood.scenes, [{ emotions: one.mood.emotions, span: 1 }], "no sequence: one scene, the chapter");
  assert.deepEqual(one.pieces!.scenePieces, [one.pieces!.piece]);

  const s = two.mood.scenes!;
  assert.deepEqual(two.mood.emotions.map((e) => e.emotion), ["tension", "dread"], "the chapter's own emotions unchanged");
  assert.deepEqual(s.map((x) => x.emotions[0].emotion), ["calm", "tension", "dread"]);
  assert.deepEqual(s.map((x) => x.span), [0.4, 0.35, 0.25]);
  assert.ok(Math.abs(s.reduce((t, x) => t + x.span, 0) - 1) < 1e-9);
  for (const x of s) assert.deepEqual(Object.keys(x).sort(), ["emotions", "span"], "no scene carries text");
  assert.doesNotMatch(JSON.stringify(result), /supper/);

  const per = two.pieces!.scenePieces!;
  assert.equal(per.length, s.length);
  assert.ok(per[0].moodTags.includes("calm"), "the calm scene gets a calm piece");
  for (const p of per) {
    assert.equal(p.vocals, "none");
    assert.ok(CATALOG_IDS.has(p.id), "a scene's piece is a catalog piece (05.3)");
  }
  // The chapter's piece and alternates still fit the chapter's emotions, never a scene's alone (A14).
  for (const p of [two.pieces!.piece, ...two.pieces!.alternates]) assert.ok(p.moodTags.some((t) => t === "tension" || t === "dread"));
});

test("a run saved before 07.1 (drafts with no scenes) finishes with one scene per scored chapter", async () => {
  const { job, store } = setup();
  await job.start(await bookKey(book), book);
  for (let i = 0; i < 50; i++) {
    const run = (await store.get<Run>("job"))!;
    if (run.phase === "pieces") break;
    await job.step();
  }
  const run = (await store.get<Run>("job"))!;
  assert.equal(run.phase, "pieces");
  await store.put("job", { ...run, drafts: run.drafts.map((d) => (d ? { emotions: d.emotions, sources: d.sources } : d)) });
  await drain(job);
  const ch = (await job.status()).view!.result!.chapters[1];
  assert.deepEqual(ch.mood.scenes, [{ emotions: ch.mood.emotions, span: 1 }]);
  assert.deepEqual(ch.pieces!.scenePieces, [ch.pieces!.piece]);
});

test("rescoring a cached book waits until its result is the minimum age, 7 days by default (A34)", async () => {
  let now = NOW;
  const { job, raw, search, model } = setup({ now: () => now, rescoreMinAgeMs: undefined });
  const key = await bookKey(book);
  await job.start(key, book);
  await drain(job);
  const paid = search.queries.length + model.calls.length;

  now = NOW + 6 * DAY_MS;
  const early = await raw.start(key, book, true);
  assert.ok("refused" in early);
  assert.equal(early.refused.reason, "rescore-too-soon");
  assert.equal(early.refused.retryAfterMs, DAY_MS, "retry once the result is 7 days old");
  assert.equal((await raw.status()).view?.state, "done", "a refused rescore leaves the job as it was");
  assert.equal((await raw.step()).more, false);
  assert.equal(search.queries.length + model.calls.length, paid, "and buys nothing");

  now = NOW + 7 * DAY_MS;
  const due = await raw.start(key, book, true);
  assert.ok(!("refused" in due) && due.run, "a 7-day-old result may be rescored");
});

test("a cached book or a run already going never asks the limiter; a new run does, and a refusal stores nothing (A34)", async () => {
  const asked: string[] = [];
  let allow = true;
  const limiter: Limiter = {
    async admit(client) {
      asked.push(client);
      return allow ? { ok: true } : { ok: false, reason: "client-limit", retryAfterMs: 1234 };
    },
  };
  const { job, raw, store } = setup({ limiter });
  const key = await bookKey(book);
  await job.start(key, book, false, { client: "203.0.113.7" });
  assert.deepEqual(asked, ["203.0.113.7"], "a new run is counted for its client");
  await job.start(key, book, false, { client: "203.0.113.7" });
  assert.equal(asked.length, 1, "a run already going is not");
  await drain(job);
  for (let i = 0; i < 5; i++) assert.equal((await job.start(key, book, false, { client: "203.0.113.7" })).view.state, "done");
  assert.equal(asked.length, 1, "a cached book never is");

  allow = false;
  const otherStore = memoryStore();
  const other = setup({ limiter, store: otherStore });
  const otherKey = await bookKey({ ...book, title: "Carmilla" });
  const refused = await other.raw.start(otherKey, { ...book, title: "Carmilla" }, false, { client: "203.0.113.7" });
  assert.deepEqual(refused, { refused: { reason: "client-limit", retryAfterMs: 1234 } });
  assert.deepEqual(otherStore.keys(), [], "a refused start stores nothing, not even a waiting job");
  assert.equal((await other.raw.status()).view, null);
  assert.ok(!JSON.stringify(await store.get("job")).includes("203.0.113.7"), "the client is never stored with the job");
  assert.equal((await raw.status()).view?.state, "done");
});

test("starts that would wait at the cap are counted too, so made-up books cannot queue up for next month (A34)", async () => {
  const meter = createMeter(memoryStore());
  await meter.add(monthOf(NOW), 50);
  const limiter = createRateLimiter(memoryStore(), { perClient: 2, global: 30, windowMs: HOUR_MS });
  const outs = [];
  for (const title of ["A", "B", "C"]) {
    const b = { ...book, title };
    outs.push(await setup({ meter, limiter }).raw.start(await bookKey(b), b, false, { client: "198.51.100.9" }));
  }
  assert.deepEqual(
    outs.map((o) => ("refused" in o ? o.refused.reason : o.view.state)),
    ["capped", "capped", "client-limit"],
  );
});

test("a failed model call is metered: the provider's reported usage, else a conservative estimate (01.21)", async () => {
  const key = await bookKey(book);
  async function failedRun(usage?: { input: number; output: number }) {
    const meter = createMeter(memoryStore());
    const search = fakeSearch();
    const reqs: CompletionRequest[] = [];
    const model: ModelClient = {
      model: "gpt-5-mini",
      async complete(req) {
        reqs.push(req);
        throw Object.assign(new Error("model unavailable"), usage ? { usage } : {});
      },
    };
    const job = createBookJob({ store: memoryStore(), meter, capUsd: 20, search, model, now: () => NOW });
    await job.start(key, book);
    for (let i = 0; i < 50 && (await job.step()).more; i++);
    assert.equal((await job.status()).view?.state, "failed");
    assert.equal(reqs.length, MAX_ATTEMPTS, "the reading failed on every attempt");
    const modelSpend = (await meter.spent(monthOf(NOW))) - search.queries.length * BRAVE_USD_PER_QUERY;
    return { modelSpend, reqs };
  }

  const reported = { input: 5000, output: 300 };
  const a = await failedRun(reported);
  assert.ok(Math.abs(a.modelSpend - MAX_ATTEMPTS * openAiCost("gpt-5-mini", reported)) < 1e-12, "the reported usage is counted");

  const b = await failedRun();
  const estimated = b.reqs.reduce((sum, r) => sum + openAiCost("gpt-5-mini", estimateUsage(r)), 0);
  assert.ok(estimated > 0);
  assert.ok(Math.abs(b.modelSpend - estimated) < 1e-12, "with none reported, the estimate is counted");
});
