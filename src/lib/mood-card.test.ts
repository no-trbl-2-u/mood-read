import assert from "node:assert/strict";
import { test } from "node:test";

import { EMOTIONS as THEME_EMOTIONS, emotionHues } from "../ui/theme.ts";
import type { Kv } from "./library-store.ts";
import {
  alternatesLine,
  EMOTION_NAMES,
  intensityPercent,
  moodCardView,
  pieceLine,
  strongest,
} from "./mood-card.ts";
import { stickerLabel } from "./labels.ts";
import { createScoringStore } from "./scoring-store.ts";
import { EMOTIONS, type BookScores, type ChapterScore, type Piece } from "./types.ts";

const piece = (n: number): Piece => ({ id: `p${n}`, title: `Theme ${n}`, artist: `Composer ${n}`, kind: "score", vocals: "none", moodTags: ["tension"] });

function score(over: Partial<ChapterScore["mood"]> = {}, playlist: ChapterScore["playlist"] | undefined = undefined): ChapterScore {
  return {
    mood: {
      chapterIndex: 0,
      chapterTitle: "The Storm",
      emotions: [
        { emotion: "wonder", intensity: 0.4 },
        { emotion: "tension", intensity: 0.8 },
        { emotion: "dread", intensity: 0.55 },
      ],
      sources: [{ url: "https://summaries.example/x", title: "A summary" }],
      coverage: "scored",
      model: "m",
      version: "v",
      scoredAt: 1,
      ...over,
    },
    pieces: [piece(1), piece(2), piece(3)],
    playlist: playlist === undefined ? { chapterIndex: 0, piece: "p1", alternates: ["p2", "p3"], pick: "auto" } : playlist,
  };
}

function mapKv(map = new Map<string, string>()): Kv {
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const scores = (chapters: ChapterScore[]): BookScores => ({ jobId: "j", model: "m", version: "v", scoredAt: 1, costUsd: 0, chapters });

test("the emotion set in the types and in the theme stay in step, and every emotion has a hue and a name", () => {
  assert.deepEqual([...EMOTIONS], [...THEME_EMOTIONS]);
  for (const e of EMOTIONS) {
    assert.ok(emotionHues[e], e);
    assert.ok(EMOTION_NAMES[e], e);
  }
});

test("A16: an emotion chip reads its name and intensity", () => {
  // Seen and heard alike (06.5): the sticker's text is its screen-reader name.
  assert.equal(stickerLabel(EMOTION_NAMES.tension, 0.8), "Tension 80%");
  assert.equal(stickerLabel(EMOTION_NAMES.wonder, 0.704), "Wonder 70%");
  assert.equal(intensityPercent(1.7), 100);
  assert.equal(intensityPercent(-1), 0);
  assert.equal(intensityPercent(Number.NaN), 0);
});

test("a collapsed row's chips are the two strongest emotions", () => {
  assert.deepEqual(strongest(score().mood.emotions, 2).map((e) => e.emotion), ["tension", "dread"]);
  assert.deepEqual(strongest(score().mood.emotions).map((e) => e.emotion), ["tension", "dread", "wonder"]);
});

test("pieces read their artist and kind; alternates read on one muted line", () => {
  assert.equal(pieceLine(piece(1)), "Composer 1 · Score");
  assert.equal(pieceLine({ artist: "A", kind: "ambient" }), "A · Ambient");
  assert.equal(alternatesLine([piece(2), piece(3)]), "Theme 2 (Composer 2) · Theme 3 (Composer 3)");
});

test("A21: a chapter not reached shows nothing, whatever its score", () => {
  assert.deepEqual(moodCardView(false, score()), { kind: "locked" });
  assert.deepEqual(moodCardView(false, score({ coverage: "too-little", emotions: [] }, null)), { kind: "locked" });
  assert.deepEqual(moodCardView(false, null), { kind: "locked" });
});

test("A16, A21: a reached, scored chapter shows its emotions strongest first, its named piece, alternates and pick", () => {
  const v = moodCardView(true, score());
  assert.equal(v.kind, "scored");
  if (v.kind !== "scored") return;
  assert.deepEqual(v.emotions.map((e) => e.emotion), ["tension", "dread", "wonder"]);
  assert.equal(v.piece?.id, "p1");
  assert.deepEqual(v.alternates.map((p) => p.id), ["p2", "p3"]);
  assert.equal(v.pick, "auto");
  // Only emotions and pieces: nothing of the sources is carried into what the card shows.
  assert.equal(JSON.stringify(v).includes("summaries.example"), false);
});

test("a reached chapter that is unscored, or never scored, or has no piece", () => {
  assert.deepEqual(moodCardView(true, score({ coverage: "too-little", emotions: [] }, null)), { kind: "unscored" });
  assert.deepEqual(moodCardView(true, null), { kind: "none" });
  const v = moodCardView(true, score({}, null));
  assert.ok(v.kind === "scored" && v.piece === null && v.alternates.length === 0 && v.pick === "auto");
  const stale = moodCardView(true, score({}, { chapterIndex: 0, piece: "p1", alternates: ["p2", "p3"], pick: "gone" }));
  assert.ok(stale.kind === "scored" && stale.pick === "auto", "a pick that is no longer an alternate reads as auto");
});

test("A16: picking an alternate saves it for that chapter only, survives a reload, and leaves its mood alone", () => {
  const map = new Map<string, string>();
  const store = createScoringStore(mapKv(map));
  const second = { ...score({ chapterIndex: 1, chapterTitle: "Arrival" }), playlist: { chapterIndex: 1, piece: "p1", alternates: ["p2", "p3"], pick: "auto" } };
  store.saveScores("b", scores([score(), second]));
  const moodBefore = JSON.stringify(store.chapterScore("b", { index: 0, title: "The Storm" })!.mood);

  assert.equal(store.savePick("b", { index: 0, title: "The Storm" }, "p3"), true);
  const reloaded = createScoringStore(mapKv(map));
  const kept = reloaded.chapterScore("b", { index: 0, title: "The Storm" })!;
  assert.equal(kept.playlist!.pick, "p3");
  assert.equal(JSON.stringify(kept.mood), moodBefore, "the ChapterMood is untouched");
  assert.equal(reloaded.chapterScore("b", { index: 1, title: "Arrival" })!.playlist!.pick, "auto", "other chapters keep theirs");
  const v = moodCardView(true, kept);
  assert.ok(v.kind === "scored" && v.pick === "p3");
});

test("A16: Auto returns the chapter to auto; picking the named piece itself is auto", () => {
  const store = createScoringStore(mapKv());
  store.saveScores("b", scores([score()]));
  const at = { index: 0, title: "The Storm" };
  store.savePick("b", at, "p2");
  assert.equal(store.chapterScore("b", at)!.playlist!.pick, "p2");
  store.savePick("b", at, "auto");
  assert.equal(store.chapterScore("b", at)!.playlist!.pick, "auto");
  store.savePick("b", at, "p2");
  store.savePick("b", at, "p1");
  assert.equal(store.chapterScore("b", at)!.playlist!.pick, "auto");
});

test("a pick that is not an alternate, or for a chapter with no playlist or a changed title, is not saved", () => {
  const store = createScoringStore(mapKv());
  store.saveScores("b", scores([score(), { ...score({ chapterIndex: 1, chapterTitle: "Two", coverage: "too-little", emotions: [] }), playlist: null }]));
  assert.equal(store.savePick("b", { index: 0, title: "The Storm" }, "nope"), false);
  assert.equal(store.savePick("b", { index: 1, title: "Two" }, "p2"), false);
  assert.equal(store.savePick("b", { index: 0, title: "Renamed" }, "p2"), false);
  assert.equal(store.savePick("none", { index: 0, title: "The Storm" }, "p2"), false);
  assert.equal(store.chapterScore("b", { index: 0, title: "The Storm" })!.playlist!.pick, "auto");
});
