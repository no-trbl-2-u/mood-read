// 05.3 (spec 05 A3): the matcher names catalog pieces only, every catalog cell (emotion x intensity) yields a match,
// and the same chapter and catalog always give the same answer; a book scored before v2 is re-matched from its stored
// emotions, its old piece kept as the reference (D13), with nothing sent anywhere (the matcher makes no request).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { readCatalog, type CatalogPiece } from "./catalog.ts";
import {
  HIGH_FROM,
  MAX_ALTERNATES,
  MIN_ALTERNATES,
  intensityCell,
  matchChapter,
  rankCatalog,
  rematchChapter,
  rematchScores,
  type MatchablePiece,
} from "./catalog-match.ts";
import { EMOTIONS, type BookScores, type ChapterScore, type Emotion, type EmotionScore, type Piece } from "./types.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CATALOG: CatalogPiece[] = readCatalog(JSON.parse(fs.readFileSync(path.join(ROOT, "catalog", "catalog.json"), "utf8"))).catalog.pieces;
const IDS = new Set(CATALOG.map((p) => p.id));

const mp = (id: string, moodTags: Emotion[], intensity: "low" | "high" = "low"): MatchablePiece => ({ id, title: id, artist: "A", kind: "score", vocals: "none", moodTags, intensity });
const e = (emotion: Emotion, intensity: number): EmotionScore => ({ emotion, intensity });

test("a chapter's intensity cell comes from its strongest emotion", () => {
  assert.equal(intensityCell([e("calm", 0.3), e("joy", HIGH_FROM)]), "high");
  assert.equal(intensityCell([e("calm", 0.3), e("joy", HIGH_FROM - 0.01)]), "low");
  assert.equal(intensityCell([]), "low");
});

test("the snapshot is the live catalog, and it has pieces to match", () => {
  assert.ok(CATALOG.length >= 46);
});

test("every catalog cell yields a match: the piece carries the emotion and runs at the chapter's intensity", () => {
  for (const emotion of EMOTIONS) {
    for (const [cell, intensity] of [["low", 0.4], ["high", 0.9]] as const) {
      const m = matchChapter({ emotions: [e(emotion, intensity)] }, CATALOG);
      assert.ok(m, `${emotion} ${cell} has a match`);
      assert.ok(m.piece.moodTags.includes(emotion), `${emotion} ${cell}: the piece carries the emotion`);
      assert.equal(m.piece.intensity, cell, `${emotion} ${cell}: the piece runs at the chapter's intensity`);
      assert.ok(m.alternates.length >= MIN_ALTERNATES && m.alternates.length <= MAX_ALTERNATES);
    }
  }
});

test("every piece the matcher names, as the piece, an alternate or a scene's piece, is a catalog piece (A3)", () => {
  const moods = EMOTIONS.flatMap((a) => EMOTIONS.map((b) => ({ emotions: [e(a, 0.8), e(b, 0.4)], scenes: [{ emotions: [e(b, 0.7)], span: 0.5 }, { emotions: [e(a, 0.3)], span: 0.5 }] })));
  for (const mood of moods) {
    const m = matchChapter(mood, CATALOG)!;
    for (const p of [m.piece, ...m.alternates, ...m.scenePieces]) {
      assert.ok(IDS.has(p.id), `${p.id} is in the catalog`);
      assert.equal(p.vocals, "none");
    }
    assert.ok(!m.alternates.some((a) => a.id === m.piece.id), "an alternate is never the piece");
    assert.equal(new Set(m.alternates.map((a) => a.id)).size, m.alternates.length, "no alternate twice");
    assert.equal(m.scenePieces.length, 2);
    assert.ok(m.scenePieces[0].moodTags.includes(mood.scenes[0].emotions[0].emotion), "a scene's piece fits the scene");
  }
});

test("deterministic: the same chapter gives the same pieces, whatever the catalog's order", () => {
  const mood = { emotions: [e("tension", 0.8), e("dread", 0.5)] };
  const a = matchChapter(mood, CATALOG)!;
  const b = matchChapter(mood, [...CATALOG].reverse())!;
  assert.deepEqual([a.piece.id, ...a.alternates.map((p) => p.id)], [b.piece.id, ...b.alternates.map((p) => p.id)]);
});

test("ranking: shared intensity first, the chapter's cell over the other, then the closer fit, then the id", () => {
  const pieces = [mp("b-off-cell", ["tension"], "high"), mp("z-both", ["tension", "dread"]), mp("c-extra", ["tension", "joy"]), mp("a-plain", ["tension"]), mp("none", ["joy"])];
  const ranked = rankCatalog([e("tension", 0.5), e("dread", 0.2)], pieces).map((p) => p.id);
  assert.deepEqual(ranked, ["z-both", "a-plain", "c-extra", "b-off-cell"], "a piece sharing nothing is left out");
});

test("too few fitting pieces names none; one scene plays the chapter's piece", () => {
  assert.equal(matchChapter({ emotions: [e("joy", 0.5)] }, [mp("a", ["joy"]), mp("b", ["joy"])]), null);
  assert.equal(matchChapter({ emotions: [] }, CATALOG), null);
  const one = matchChapter({ emotions: [e("joy", 0.5)], scenes: [{ emotions: [e("joy", 0.5)], span: 1 }] }, CATALOG)!;
  assert.deepEqual(one.scenePieces, [one.piece]);
});

test("a piece with vocals is never named, even if one got into the list", () => {
  const vocal = { ...mp("a-vocal", ["joy"]), vocals: "some" } as unknown as MatchablePiece;
  const m = matchChapter({ emotions: [e("joy", 0.5)] }, [vocal, mp("b", ["joy"]), mp("c", ["joy"]), mp("d", ["joy"])])!;
  assert.ok(![m.piece, ...m.alternates].some((p) => p.id === "a-vocal"));
});

// ---- the re-match of a book scored before v2 ----

const OLD: Piece[] = [
  { id: "composer-1--theme-1", title: "Theme 1", artist: "Composer 1", kind: "score", vocals: "none", moodTags: ["tension"] },
  { id: "composer-2--theme-2", title: "Theme 2", artist: "Composer 2", kind: "score", vocals: "none", moodTags: ["tension"] },
  { id: "composer-3--theme-3", title: "Theme 3", artist: "Composer 3", kind: "score", vocals: "none", moodTags: ["tension"] },
];

function oldChapter(index: number, over: Partial<ChapterScore> = {}): ChapterScore {
  return {
    mood: { chapterIndex: index, chapterTitle: `Chapter ${index + 1}`, emotions: [e("tension", 0.8), e("dread", 0.4)], sources: [], coverage: "scored", model: "gpt-5-mini", version: "01.2.1", scoredAt: 1 },
    pieces: OLD,
    playlist: { chapterIndex: index, piece: OLD[0].id, alternates: [OLD[1].id, OLD[2].id], pick: OLD[1].id },
    ...over,
  };
}

const book = (chapters: ChapterScore[]): BookScores => ({ jobId: "a".repeat(64), model: "gpt-5-mini", version: "01.2.1", scoredAt: 1, costUsd: 0.04, chapters });

test("a book scored before v2 is re-matched from its stored emotions: every piece a catalog piece, the old one the reference", () => {
  const tooLittle: ChapterScore = { ...oldChapter(2), mood: { ...oldChapter(2).mood, emotions: [], coverage: "too-little" }, pieces: [], playlist: null };
  const out = rematchScores(book([oldChapter(0), oldChapter(1), tooLittle]), CATALOG)!;
  assert.ok(out);
  for (const c of out.chapters.slice(0, 2)) {
    const pl = c.playlist!;
    for (const id of [pl.piece, ...pl.alternates]) assert.ok(IDS.has(id), `${id} is a catalog piece`);
    assert.ok(c.pieces.every((p) => IDS.has(p.id)));
    assert.deepEqual(c.reference, OLD[0], "the old named piece is kept as the reference");
    assert.ok(!c.pieces.some((p) => p.id === c.reference!.id), "the reference is never among the pieces");
    assert.equal(pl.pick, "auto", "a pick that is not a catalog piece goes back to auto");
    assert.deepEqual(c.mood, oldChapter(c.mood.chapterIndex).mood, "the stored emotions stay as they were: no new research");
  }
  assert.deepEqual(out.chapters[2], tooLittle, "an unscored chapter is left alone");
  assert.equal(rematchScores(out, CATALOG), null, "once matched, nothing changes again");
});

test("a re-match keeps a reference it already has, a pick that is still an alternate, and scene pieces per scene", () => {
  const first = rematchChapter(oldChapter(0), CATALOG)!;
  const pick = first.playlist!.alternates[1];
  const ref: Piece = { id: "x--y", title: "Y", artist: "X", kind: "score", vocals: "none", moodTags: ["tension"] };
  const scenes = [{ emotions: [e("calm", 0.5)], span: 0.5 }, { emotions: [e("dread", 0.9)], span: 0.5 }];
  const again = rematchChapter({ ...oldChapter(0, { reference: ref }), mood: { ...oldChapter(0).mood, scenes }, playlist: { ...oldChapter(0).playlist!, pick } }, CATALOG)!;
  assert.deepEqual(again.reference, ref);
  assert.equal(again.playlist!.pick, pick, "the pick is a catalog piece among the alternates: it stays");
  assert.equal(again.playlist!.scenePieces!.length, 2);
  assert.ok(again.playlist!.scenePieces!.every((id) => IDS.has(id) && again.pieces.some((p) => p.id === id)));
});

test("a scored chapter that named no piece is matched now; an empty catalog changes nothing", () => {
  const none = rematchChapter(oldChapter(0, { pieces: [], playlist: null }), CATALOG)!;
  assert.ok(IDS.has(none.playlist!.piece));
  assert.equal(none.reference, undefined);
  assert.equal(rematchScores(book([oldChapter(0)]), []), null);
});
