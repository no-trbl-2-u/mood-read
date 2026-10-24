import assert from "node:assert/strict";
import { test } from "node:test";

import { filterEmotions, fingerprint, FINGERPRINT_SIZE, moodFilter } from "./fingerprint.ts";
import type { BookScores, ChapterMood, ChapterScore, Emotion, EmotionScore } from "./types.ts";

const chapters = [
  { index: 0, title: "One", start: 0 },
  { index: 1, title: "Two", start: 100 },
  { index: 2, title: "Three", start: 200 },
];
const book = { chapters };

const e = (emotion: Emotion, intensity: number): EmotionScore => ({ emotion, intensity });

function score(index: number, emotions: EmotionScore[], coverage: ChapterMood["coverage"] = "scored", title = chapters[index].title): ChapterScore {
  return {
    mood: { chapterIndex: index, chapterTitle: title, emotions, sources: [], coverage, model: "m", version: "v", scoredAt: 1 },
    pieces: [],
    playlist: null,
  };
}

function scores(...list: ChapterScore[]): BookScores {
  return { jobId: "j", model: "m", version: "v", scoredAt: 1, costUsd: 0, chapters: list };
}

const all = scores(
  score(0, [e("tension", 0.8), e("wonder", 0.7), e("dread", 0.3)]),
  score(1, [e("sorrow", 0.9), e("calm", 0.4), e("tension", 0.2)]),
  score(2, [e("triumph", 0.95), e("joy", 0.6)]),
);

test("A8: the fingerprint sums intensities per emotion over the reached chapters, strongest first, three at most", () => {
  const print = fingerprint(book, all, 100);
  assert.equal(FINGERPRINT_SIZE, 3);
  assert.deepEqual(print.map((x) => x.emotion), ["tension", "sorrow", "wonder"]);
  assert.ok(Math.abs(print[0].intensity - 1.0) < 1e-9, "tension 0.8 + 0.2");
  assert.equal(print.length, 3);
});

test("A8, A21: unreached chapters never count", () => {
  const print = fingerprint(book, all, 0);
  assert.deepEqual(print, [e("tension", 0.8), e("wonder", 0.7), e("dread", 0.3)]);
  for (const x of print) assert.ok(!["sorrow", "calm", "triumph", "joy"].includes(x.emotion));
});

test("A8: the playing chapter counts as reached, as on the river", () => {
  assert.deepEqual(fingerprint(book, all, null), []);
  assert.deepEqual(
    fingerprint(book, all, null, chapters[2]).map((x) => x.emotion),
    ["tension", "triumph", "sorrow"],
  );
});

test("A8: a book with no reached scored chapter shows none", () => {
  assert.deepEqual(fingerprint(book, null, 200), [], "no scores at all");
  assert.deepEqual(fingerprint(book, all, null), [], "nothing reached");
  const thin = scores(score(0, [], "too-little"), score(1, [e("sorrow", 0.9)]));
  assert.deepEqual(fingerprint(book, thin, 0), [], "the one reached chapter had too little written about it");
  assert.deepEqual(fingerprint(book, thin, 100), [e("sorrow", 0.9)]);
});

test("a stored score counts only while its chapter keeps the title it was scored under", () => {
  const renamed = scores(score(0, [e("dread", 0.9)], "scored", "Old title"), score(1, [e("calm", 0.5)]));
  assert.deepEqual(fingerprint(book, renamed, 100), [e("calm", 0.5)]);
});

test("fewer than three emotions shows fewer; ties keep the fixed emotion order; nonsense intensities are dropped", () => {
  assert.deepEqual(fingerprint(book, scores(score(0, [e("joy", 0.5)])), 0), [e("joy", 0.5)]);
  const tie = scores(score(0, [e("triumph", 0.5), e("tension", 0.5), e("calm", 0), e("dread", Number.NaN)]));
  assert.deepEqual(fingerprint(book, tie, 0), [e("tension", 0.5), e("triumph", 0.5)]);
});

test("a listener's seed never mixes with a researched mood: researched chapters count first (07.6)", () => {
  const seeded = scores(score(0, [e("joy", 0.9)], "listener"), score(1, [e("calm", 0.4)]));
  assert.deepEqual(fingerprint(book, seeded, 100), [e("calm", 0.4)]);
});

test("a book with no researched chapter wears its seeds, reached chapters only (07.6)", () => {
  const seeded = scores(score(0, [e("joy", 0.8)], "listener"), score(1, [], "too-little"), score(2, [e("dread", 0.4)], "listener"));
  assert.deepEqual(fingerprint(book, seeded, 0), [e("joy", 0.8)]);
  assert.deepEqual(fingerprint(book, { chapters: seeded.chapters }, 200), [e("joy", 0.8), e("dread", 0.4)]);
});

test("A8: the Mood filter keeps only books whose fingerprint holds the lit emotion, strongest match first", () => {
  const shelf = [
    { item: "a", print: [e("tension", 0.8), e("wonder", 0.7)] },
    { item: "b", print: [] },
    { item: "c", print: [e("sorrow", 1.2), e("tension", 1.1)] },
    { item: "d", print: [e("wonder", 0.9)] },
    { item: "e", print: [e("tension", 0.8)] },
  ];
  assert.deepEqual(moodFilter(shelf, null), ["a", "b", "c", "d", "e"], "nothing lit keeps the whole shelf, in order");
  assert.deepEqual(moodFilter(shelf, "tension"), ["c", "a", "e"], "ties keep the shelf's order");
  assert.deepEqual(moodFilter(shelf, "wonder"), ["d", "a"]);
  assert.deepEqual(moodFilter(shelf, "joy"), []);
});

test("the filter offers the emotions some fingerprint holds, in the fixed order, and the lit one", () => {
  const prints = [[e("wonder", 0.7), e("tension", 0.8)], [], [e("sorrow", 0.2)]];
  assert.deepEqual(filterEmotions(prints, null), ["tension", "sorrow", "wonder"]);
  assert.deepEqual(filterEmotions(prints, "joy"), ["tension", "sorrow", "wonder", "joy"]);
  assert.deepEqual(filterEmotions([[], []], null), []);
});
