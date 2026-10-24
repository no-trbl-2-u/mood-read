import assert from "node:assert/strict";
import { test } from "node:test";

import type { Kv } from "./library-store.ts";
import { knownPieces, matchPiece, seedScore } from "./mood-match.ts";
import { createScoringRunner } from "./scoring-runner.ts";
import { createScoringStore, keepSeeds, mergeSeeds, toBookScores } from "./scoring-store.ts";
import type { Book, JobView } from "./types.ts";

const ID = "a".repeat(64);
const piece = (id: string) => ({ id, title: `Theme ${id}`, artist: "A", kind: "score" as const, vocals: "none" as const, moodTags: ["calm" as const] });

function chapters(titles: string[]): Pick<Book, "chapters"> {
  return { chapters: titles.map((title, index) => ({ bookId: "b", index, title, fileIndex: 0, start: index * 10, end: index * 10 + 10 })) };
}

function doneView(titles: string[]): JobView {
  return {
    jobId: ID,
    state: "done",
    progress: { step: 1, steps: 1, chaptersDone: titles.length, chapters: titles.length },
    result: {
      key: ID,
      model: "m",
      version: "v",
      scoredAt: 1,
      costUsd: 0.1,
      chapters: titles.map((title, index) => ({
        index,
        title,
        mood: { chapterIndex: index, chapterTitle: title, emotions: [{ emotion: "calm", intensity: 0.5 }], sources: [], coverage: "scored", model: "m", version: "v", scoredAt: 1 },
        pieces: { piece: piece(`p${index}`), alternates: [piece(`q${index}`), piece(`r${index}`)] },
      })),
    },
  };
}

function mapKv(): Kv {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

test("chapters come back with the proxy's whitespace and the first listener's casing, and are still kept (A13, A19)", () => {
  const book = chapters(["01 - The  Storm", "Chapter One"]);
  const scores = toBookScores(book, doneView(["01 - The Storm", "chapter one"]), null)!;
  assert.equal(scores.chapters.length, 2);
  const store = createScoringStore(mapKv());
  store.saveScores("b", scores);
  for (const c of book.chapters) {
    const s = store.chapterScore("b", c);
    assert.ok(s, c.title);
    assert.equal(s.mood.chapterTitle, c.title, "stored under the device's own title");
  }
});

test("a chapter whose title really differs is not given the score", () => {
  const scores = toBookScores(chapters(["The Storm", "Arrival"]), doneView(["The Storm", "Departure"]), null)!;
  assert.deepEqual(scores.chapters.map((c) => c.mood.chapterIndex), [0]);
});

test("a listener's pick survives a rescore that comes back with different spacing or casing", () => {
  const book = chapters(["The  Storm"]);
  const first = toBookScores(book, doneView(["The Storm"]), null)!;
  first.chapters[0].playlist!.pick = "q0";
  const again = toBookScores(book, doneView(["THE STORM"]), first)!;
  assert.equal(again.chapters[0].playlist!.pick, "q0");
});

test("scenes and one piece per scene are kept on the device; a scene-only piece joins the chapter's pieces (07.1)", () => {
  const view = doneView(["One"]);
  const ch = view.result!.chapters[0];
  ch.mood.scenes = [
    { emotions: [{ emotion: "calm", intensity: 0.5 }], span: 0.4 },
    { emotions: [{ emotion: "dread", intensity: 0.9 }], span: 0.6 },
  ];
  ch.pieces!.scenePieces = [piece("s0"), piece("p0")];
  const scores = toBookScores(chapters(["One"]), view, null)!;
  const kept = scores.chapters[0];
  assert.deepEqual(kept.mood.scenes, ch.mood.scenes);
  assert.deepEqual(kept.playlist!.scenePieces, ["s0", "p0"]);
  assert.deepEqual(kept.playlist!.alternates, ["q0", "r0"], "a scene piece is not an alternate");
  assert.deepEqual(kept.pieces.map((p) => p.id), ["p0", "q0", "r0", "s0"]);
});

test("a book cached before 07.1 keeps no scene pieces and still saves a pick", () => {
  const scores = toBookScores(chapters(["One"]), doneView(["One"]), null)!;
  assert.equal(scores.chapters[0].playlist!.scenePieces, undefined);
  assert.equal(scores.chapters[0].mood.scenes, undefined);
  const store = createScoringStore(mapKv());
  store.saveScores("b", scores);
  assert.equal(store.savePick("b", { index: 0, title: "One" }, "q0"), true);
});

// ---- the listener's seed (07.6, spec 07 A7): kept apart from the research, replaced only by a `scored` result ----

const seedOf = (index: number, title: string, pieceId: string | null = null) =>
  seedScore({ index, title }, [{ emotion: "dread", intensity: 0.8 }], pieceId ? piece(pieceId) : null, 5);

function mixedView(titles: string[], coverages: ("scored" | "too-little")[]): JobView {
  const v = doneView(titles);
  v.result!.chapters = v.result!.chapters.map((c, i) =>
    coverages[i] === "scored" ? c : { ...c, mood: { ...c.mood, emotions: [], coverage: "too-little" }, pieces: null },
  );
  return v;
}

test("a seed is kept apart from the research and read with it: it fills a too-little or unscored chapter", () => {
  const store = createScoringStore(mapKv());
  const book = chapters(["One", "Two", "Three"]);
  assert.deepEqual(store.chapters("b"), []);
  store.seed("b", [seedOf(2, "Three")]);
  assert.equal(store.scores("b"), null, "a seed alone is no scoring run: the band still offers to score the book");
  assert.deepEqual(store.chapters("b").map((c) => [c.mood.chapterIndex, c.mood.coverage]), [[2, "listener"]]);
  store.saveScores("b", toBookScores(book, mixedView(["One", "Two", "Three"], ["scored", "too-little", "too-little"]), null)!);
  store.seed("b", [seedOf(1, "Two")]);
  assert.deepEqual(
    store.chapters("b").map((c) => [c.mood.chapterIndex, c.mood.coverage]),
    [
      [0, "scored"],
      [1, "listener"],
      [2, "listener"],
    ],
  );
  assert.equal(store.chapters("b"), store.chapters("b"), "a stable snapshot between writes");
});

test("seeding a chapter again replaces its seed; a seed never shows over a researched mood", () => {
  const store = createScoringStore(mapKv());
  store.seed("b", [seedOf(0, "One", "x")]);
  store.seed("b", [seedOf(0, "One", "y")]);
  assert.deepEqual(store.seeds("b").map((s) => s.playlist?.piece), ["y"]);
  const merged = mergeSeeds(toBookScores(chapters(["One"]), doneView(["One"]), null), store.seeds("b"));
  assert.deepEqual(merged.map((c) => c.mood.coverage), ["scored"]);
});

test("the replace rule: a later `scored` result replaces the seed, a `too-little` result keeps it (A7)", () => {
  const store = createScoringStore(mapKv());
  const titles = ["One", "Two"];
  store.seed("b", [seedOf(0, "One"), seedOf(1, "Two")]);
  store.saveScores("b", toBookScores(chapters(titles), mixedView(titles, ["too-little", "too-little"]), null)!);
  assert.deepEqual(store.chapters("b").map((c) => c.mood.coverage), ["listener", "listener"]);
  // A rescore: the first chapter comes back scored.
  store.saveScores("b", toBookScores(chapters(titles), mixedView(titles, ["scored", "too-little"]), store.scores("b"))!);
  assert.deepEqual(store.seeds("b").map((s) => s.mood.chapterIndex), [1]);
  assert.deepEqual(store.chapters("b").map((c) => c.mood.coverage), ["scored", "listener"]);
  assert.deepEqual(keepSeeds([seedOf(0, "Renamed")], store.scores("b")), [seedOf(0, "Renamed")], "a seed under another title is not that chapter");
});

test("the runner's finished job applies the replace rule too", async () => {
  const store = createScoringStore(mapKv());
  const book = { id: "b", ...chapters(["One", "Two"]) } as Book;
  store.seed("b", [seedOf(0, "One"), seedOf(1, "Two")]);
  const runner = createScoringRunner({
    api: { start: async () => mixedView(["One", "Two"], ["scored", "too-little"]), status: async () => null },
    store,
  });
  await runner.start(book, true);
  assert.deepEqual(store.chapters("b").map((c) => c.mood.coverage), ["scored", "listener"]);
});

test("seeding sends nothing: no fetch while a book and a chapter are seeded and read back", () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new Error("no request may leave for a seed");
  }) as typeof fetch;
  try {
    const store = createScoringStore(mapKv());
    store.saveScores("other", toBookScores(chapters(["One"]), doneView(["One"]), null)!);
    const pool = knownPieces([store.scores("other")]);
    const lit = [{ emotion: "calm" as const, intensity: 0.4 }];
    store.seed("b", [seedScore({ index: 0, title: "One" }, lit, matchPiece(lit, pool), 1), seedScore({ index: 1, title: "Two" }, lit, matchPiece(lit, pool), 1)]);
    assert.equal(store.chapters("b")[0].playlist?.piece, "p0");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = real;
  }
});

test("forgetting a book forgets its seeds", () => {
  const store = createScoringStore(mapKv());
  store.seed("b", [seedOf(0, "One")]);
  store.forget("b");
  assert.deepEqual(store.chapters("b"), []);
});
