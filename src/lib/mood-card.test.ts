import assert from "node:assert/strict";
import { test } from "node:test";

import { EMOTIONS as THEME_EMOTIONS, emotionHues } from "../ui/theme.ts";
import type { Kv } from "./library-store.ts";
import {
  alternatesLine,
  canPeek,
  EMOTION_NAMES,
  intensityPercent,
  misfitOffers,
  moodCardView,
  pieceLine,
  referenceLine,
  sceneBand,
  strongest,
  togglePeek,
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

test("A5: the playing piece is the pick when there is one, else the named piece", () => {
  const auto = moodCardView(true, score());
  assert.ok(auto.kind === "scored" && auto.playing?.id === "p1");
  const picked = moodCardView(true, score({}, { chapterIndex: 0, piece: "p1", alternates: ["p2", "p3"], pick: "p3" }));
  assert.ok(picked.kind === "scored" && picked.playing?.id === "p3");
  const none = moodCardView(true, score({}, null));
  assert.ok(none.kind === "scored" && none.playing === null);
});

test("A5: \"Doesn't fit\" offers every other piece of the chapter, the named piece first, then the alternates", () => {
  const auto = moodCardView(true, score());
  assert.ok(auto.kind === "scored");
  if (auto.kind !== "scored") return;
  assert.deepEqual(misfitOffers(auto).map((p) => p.id), ["p2", "p3"]);
  const picked = moodCardView(true, score({}, { chapterIndex: 0, piece: "p1", alternates: ["p2", "p3"], pick: "p2" }));
  assert.ok(picked.kind === "scored");
  if (picked.kind !== "scored") return;
  assert.deepEqual(misfitOffers(picked).map((p) => p.id), ["p1", "p3"]);
  const lone = moodCardView(true, score({}, { chapterIndex: 0, piece: "p1", alternates: [], pick: "auto" }));
  assert.ok(lone.kind === "scored" && misfitOffers(lone).length === 0);
  const none = moodCardView(true, score({}, null));
  assert.ok(none.kind === "scored" && misfitOffers(none).length === 0);
});

// ---- The scene band (07.2, spec 07 A2) -----------------------------------------------------------------------

const SCENES = [
  { emotions: [{ emotion: "calm" as const, intensity: 0.3 }, { emotion: "wonder" as const, intensity: 0.6 }], span: 0.4 },
  { emotions: [{ emotion: "tension" as const, intensity: 0.9 }], span: 0.35 },
  { emotions: [{ emotion: "triumph" as const, intensity: 0.8 }], span: 0.25 },
];
const CH = { start: 100, end: 200 };

test("A2: the band shows the playing scene's emotions, strongest first, and changes as the clock crosses a boundary", () => {
  const s = score({ scenes: SCENES });
  assert.deepEqual(sceneBand(s, CH, 110, null), [{ emotion: "wonder", intensity: 0.6 }, { emotion: "calm", intensity: 0.3 }]);
  assert.deepEqual(sceneBand(s, CH, 140, null), [{ emotion: "tension", intensity: 0.9 }]);
  assert.deepEqual(sceneBand(s, CH, 190, 190), [{ emotion: "triumph", intensity: 0.8 }]);
  // A seek back shows the earlier scene again.
  assert.deepEqual(sceneBand(s, CH, 105, 190), SCENES[0].emotions.slice().reverse());
});

test("A2: a scene not yet reached shows nothing: the band never runs ahead of the clock or the furthest place", () => {
  const s = score({ scenes: SCENES });
  // Just short of the second scene: nothing of the second or third scene is in the band.
  const before = sceneBand(s, CH, 139.9, 120)!;
  assert.ok(!before.some((e) => e.emotion === "tension" || e.emotion === "triumph"));
  // The furthest place reached is the third scene, the clock back in the first: the band follows the clock.
  assert.deepEqual(sceneBand(s, CH, 101, 190)?.map((e) => e.emotion), ["wonder", "calm"]);
  // A place not yet reached (ahead of the clock's mark) shows nothing.
  assert.equal(sceneBand(s, CH, Number.NaN, null), null);
});

test("A2: no band for a chapter with one scene, no scenes, no score, too little written, or no chapter", () => {
  assert.equal(sceneBand(score(), CH, 110, null), null, "no scenes: the chapter's own chips say it all");
  assert.equal(sceneBand(score({ scenes: [{ emotions: SCENES[0].emotions, span: 1 }] }), CH, 110, null), null);
  assert.equal(sceneBand(null, CH, 110, null), null);
  assert.equal(sceneBand(score({ scenes: SCENES, coverage: "too-little" }), CH, 110, null), null);
  assert.equal(sceneBand(score({ scenes: SCENES }), undefined, 110, null), null);
});

test("A7: a listener's seed shows at once, reached or not, marked as theirs, its matched piece the one that plays (07.6)", () => {
  const seed = score({ coverage: "listener", sources: [], emotions: [{ emotion: "calm", intensity: 0.4 }] }, { chapterIndex: 0, piece: "p1", alternates: [], pick: "auto" });
  for (const reached of [false, true]) {
    const v = moodCardView(reached, seed);
    assert.equal(v.kind, "scored");
    if (v.kind !== "scored") return;
    assert.equal(v.listener, true);
    assert.equal(v.playing?.id, "p1");
    assert.deepEqual(v.alternates, []);
  }
  const none = moodCardView(true, { ...seed, pieces: [], playlist: null });
  assert.equal(none.kind === "scored" && none.piece, null, "no piece matched: the soundscape plays");
  const researched = moodCardView(true, score());
  assert.equal(researched.kind === "scored" && researched.listener, undefined);
});

test("A35: a reached, scored, non-playing row opens its mood card from its chips; one row at a time; a locked row never (A21)", () => {
  const scored = moodCardView(true, score());
  assert.equal(canPeek(scored, false), true);
  // The playing row is always open: its chips are the card's, not a toggle.
  assert.equal(canPeek(scored, true), false);
  assert.equal(canPeek(moodCardView(false, score()), false), false);
  assert.equal(canPeek({ kind: "none" }, false), false);
  assert.equal(canPeek({ kind: "unscored" }, false), false);
  assert.equal(canPeek({ kind: "scored", emotions: [], piece: null, alternates: [], pick: "auto", playing: null }, false), false);

  // A listener's own seed (07.6) is theirs, not a spoiler: it opens even on a row not yet reached.
  const seed = score({ coverage: "listener", sources: [], emotions: [{ emotion: "calm", intensity: 0.4 }] });
  assert.equal(canPeek(moodCardView(false, seed), false), true);

  assert.equal(togglePeek(null, 2), 2);
  assert.equal(togglePeek(2, 2), null);
  assert.equal(togglePeek(1, 2), 2);
});

// ---- 05.3 (spec 05 A3, D13): the catalog piece's license and the reference ----

test("the card shows the named catalog piece's title, artist and license, and the reference as \"In the spirit of\"", () => {
  const ref: Piece = { id: "famous--theme", title: "Famous Theme", artist: "Famous Composer", kind: "score", vocals: "none", moodTags: ["tension"] };
  const v = moodCardView(true, { ...score(), reference: ref }, (id) => (id === "p1" ? "CC BY 4.0" : null));
  assert.equal(v.kind, "scored");
  if (v.kind !== "scored") return;
  assert.equal(v.license, "CC BY 4.0");
  assert.deepEqual(v.reference, ref);
  assert.equal(pieceLine(v.piece!, v.license), "Composer 1 · Score · CC BY 4.0");
  assert.equal(referenceLine(v.reference!), "In the spirit of Famous Theme by Famous Composer");
  assert.ok(![v.piece, ...v.alternates, v.playing].some((p) => p?.id === ref.id), "the reference never plays and is never offered as a pick");
  assert.ok(!misfitOffers(v).some((p) => p.id === ref.id));
});

test("with no catalog to read, or no reference stored, the card shows neither", () => {
  const v = moodCardView(true, score());
  if (v.kind !== "scored") throw new Error("scored");
  assert.equal(v.license, null);
  assert.equal(v.reference, null);
  assert.equal(pieceLine(v.piece!, v.license), "Composer 1 · Score");
});
