import assert from "node:assert/strict";
import { test } from "node:test";

import { draftFrom, knownPieces, matchPiece, MAX_SEED, SEED_HIGH, SEED_LOW, seedLevel, seedScore, tapSeed } from "./mood-match.ts";
import type { BookScores, ChapterScore, Emotion, EmotionScore, Piece } from "./types.ts";

const piece = (id: string, moodTags: Emotion[], vocals = "none"): Piece => ({ id, title: `T ${id}`, artist: "A", kind: "score", vocals: vocals as "none", moodTags });

function scored(pieces: Piece[], coverage: ChapterScore["mood"]["coverage"] = "scored"): ChapterScore {
  return {
    mood: { chapterIndex: 0, chapterTitle: "One", emotions: [], sources: [], coverage, model: "m", version: "v", scoredAt: 1 },
    pieces,
    playlist: null,
  };
}
const book = (...chapters: ChapterScore[]): BookScores => ({ jobId: "j", model: "m", version: "v", scoredAt: 1, costUsd: 0, chapters });

test("the intensities: low 0.4, high 0.8, three emotions at most", () => {
  assert.deepEqual([SEED_LOW, SEED_HIGH, MAX_SEED], [0.4, 0.8, 3]);
});

test("a chip cycles: one tap low, two high, a third clears", () => {
  let d: EmotionScore[] = [];
  d = tapSeed(d, "dread");
  assert.equal(seedLevel(d, "dread"), "low");
  d = tapSeed(d, "dread");
  assert.equal(seedLevel(d, "dread"), "high");
  assert.deepEqual(d, [{ emotion: "dread", intensity: SEED_HIGH }]);
  d = tapSeed(d, "dread");
  assert.equal(seedLevel(d, "dread"), "off");
  assert.deepEqual(d, []);
});

test("up to three lit: a fourth unlit chip does nothing, a lit one still cycles", () => {
  let d: EmotionScore[] = [];
  for (const e of ["tension", "sorrow", "wonder"] as Emotion[]) d = tapSeed(d, e);
  assert.equal(tapSeed(d, "joy"), d);
  assert.equal(seedLevel(tapSeed(d, "joy"), "joy"), "off");
  d = tapSeed(d, "sorrow");
  assert.equal(seedLevel(d, "sorrow"), "high");
  d = tapSeed(tapSeed(d, "sorrow"), "joy");
  assert.deepEqual(d.map((x) => x.emotion), ["tension", "wonder", "joy"]);
});

test("a kept seed opens the sheet as it was: above the midpoint is high", () => {
  const d = draftFrom([
    { emotion: "joy", intensity: 0.8 },
    { emotion: "calm", intensity: 0.4 },
    { emotion: "sorrow", intensity: 0.65 },
    { emotion: "dread", intensity: 0.2 },
  ]);
  assert.deepEqual(d, [
    { emotion: "joy", intensity: SEED_HIGH },
    { emotion: "calm", intensity: SEED_LOW },
    { emotion: "sorrow", intensity: SEED_HIGH },
  ]);
});

test("the pieces the device knows: every research chapter's, once each, never one with vocals or a seed's", () => {
  const a = piece("a", ["calm"]);
  const pool = knownPieces([
    book(scored([a, piece("b", ["dread"])]), scored([a, piece("v", ["joy"], "lead")])),
    null,
    book(scored([piece("c", ["joy"])]), scored([piece("s", ["joy"])], "listener"), scored([piece("t", [])], "too-little")),
  ]);
  assert.deepEqual(pool.map((p) => p.id), ["a", "b", "c"]);
});

test("pieces held besides the scored books (the catalog manifest, once kept) join the pool after them", () => {
  const pool = knownPieces([book(scored([piece("a", ["calm"])]))], [piece("a", ["calm"]), piece("k", ["wonder"])]);
  assert.deepEqual(pool.map((p) => p.id), ["a", "k"]);
});

test("the match: the most lit intensity its mood tags cover", () => {
  const pool = [piece("calm", ["calm"]), piece("dread", ["dread"]), piece("both", ["dread", "tension"])];
  const lit = [
    { emotion: "dread" as const, intensity: SEED_HIGH },
    { emotion: "tension" as const, intensity: SEED_LOW },
  ];
  assert.equal(matchPiece(lit, pool)?.id, "both");
  assert.equal(matchPiece([{ emotion: "calm", intensity: SEED_LOW }], pool)?.id, "calm");
});

test("a tie goes to the piece with fewer tags beside the lit ones, then the first known", () => {
  const pool = [piece("wide", ["joy", "triumph", "wonder"]), piece("first", ["joy", "calm"]), piece("narrow", ["joy", "calm"]), piece("only", ["joy"])];
  assert.equal(matchPiece([{ emotion: "joy", intensity: SEED_LOW }], pool)?.id, "only");
  assert.equal(matchPiece([{ emotion: "joy", intensity: SEED_LOW }], pool.slice(0, 3))?.id, "first");
});

test("no piece shares a lit emotion, or none is known: no match, so the soundscape plays", () => {
  assert.equal(matchPiece([{ emotion: "romance", intensity: SEED_HIGH }], [piece("a", ["calm"])]), null);
  assert.equal(matchPiece([{ emotion: "romance", intensity: SEED_HIGH }], []), null);
  assert.equal(matchPiece([], [piece("a", ["calm"])]), null);
});

test("a seed is a listener mood with no sources, its emotions strongest first, and the match as its one piece", () => {
  const p = piece("a", ["calm"]);
  const lit = [
    { emotion: "joy" as const, intensity: SEED_LOW },
    { emotion: "calm" as const, intensity: SEED_HIGH },
  ];
  const s = seedScore({ index: 2, title: "Three" }, lit, p, 99);
  assert.deepEqual(s.mood, {
    chapterIndex: 2,
    chapterTitle: "Three",
    emotions: [
      { emotion: "calm", intensity: SEED_HIGH },
      { emotion: "joy", intensity: SEED_LOW },
    ],
    sources: [],
    coverage: "listener",
    model: "listener",
    version: "07.6",
    scoredAt: 99,
  });
  assert.deepEqual(s.pieces, [p]);
  assert.deepEqual(s.playlist, { chapterIndex: 2, piece: "a", alternates: [], pick: "auto" });
  const none = seedScore({ index: 0, title: "One" }, lit, null, 1);
  assert.deepEqual([none.pieces, none.playlist], [[], null]);
});
