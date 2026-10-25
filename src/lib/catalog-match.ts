// The scorer picks from the catalog (spec 05, 05.3, A3; D8): one pure matcher, shared by the scoring proxy
// (proxy/src/catalog.ts, over the snapshot bundled into the Worker) and the app (re-matching a book scored before v2
// against the catalog it loaded, with no request to the proxy). Given a chapter's emotions and scenes and the catalog's
// pieces, it names the chapter's piece, its alternates and one piece per scene, every one a catalog id, so the piece
// the card names is the piece that plays. The famous piece the research names beside it is a reference only, shown as
// "In the spirit of" and never played (D13): `reference`, never among the pieces.
//
// The fit: a piece's mood tags against the chapter's emotions, each shared emotion counting its intensity, at full
// weight when the piece runs at the chapter's intensity (low or high, from its strongest emotion) and OFF_CELL of it
// otherwise. Ties go to the piece with fewer tags beside the chapter's emotions (the closer fit), then to the lower id,
// so the same chapter and catalog always give the same answer.
// Pure and type-strippable (node --test, and the Worker's bundle): no runtime imports.
import type { Intensity } from "./catalog.ts";
import type { BookScores, ChapterScore, EmotionScore, Piece, Scene } from "./types.ts";

/** A chapter whose strongest emotion is at least this intense wants the catalog's high-intensity pieces. */
export const HIGH_FROM = 0.6;
/** The weight of a piece at the other intensity: it still fits, behind every piece at the chapter's own. */
export const OFF_CELL = 0.6;
/** A chapter's piece comes with two to four alternates; fewer than two fitting pieces left and none is named. */
export const MIN_ALTERNATES = 2;
export const MAX_ALTERNATES = 4;

/** What the matcher reads of a catalog piece: spec 01's Piece and its intensity. */
export type MatchablePiece = Piece & { intensity: Intensity };

/** What a chapter's piece is matched on: its emotions and, from 07.1, its scenes (absent: one scene, the chapter). */
export type MatchMood = { emotions: readonly EmotionScore[]; scenes?: readonly Scene[] };

/** The chapter's piece, its alternates (none the piece) and one piece per scene, in order: all catalog pieces. */
export type CatalogMatch<P> = { piece: P; alternates: P[]; scenePieces: P[] };

/** The intensity cell a chapter's emotions ask for: high from HIGH_FROM up, else low. */
export function intensityCell(emotions: readonly EmotionScore[]): Intensity {
  const top = emotions.reduce((m, e) => Math.max(m, e.intensity), 0);
  return top >= HIGH_FROM ? "high" : "low";
}

/** How well a piece fits these emotions; 0 when it shares none. */
export function fitScore(piece: Pick<MatchablePiece, "moodTags" | "intensity">, emotions: readonly EmotionScore[]): number {
  const fit = emotions.filter((e) => piece.moodTags.includes(e.emotion)).reduce((s, e) => s + e.intensity, 0);
  return piece.intensity === intensityCell(emotions) ? fit : fit * OFF_CELL;
}

/** Every catalog piece that fits these emotions, best first, deterministically. Never one with vocals (A20). */
export function rankCatalog<P extends MatchablePiece>(emotions: readonly EmotionScore[], pieces: readonly P[]): P[] {
  const wanted = new Set(emotions.map((e) => e.emotion));
  return pieces
    .filter((p) => p.vocals === "none")
    .map((p) => ({ p, score: fitScore(p, emotions), extra: p.moodTags.filter((t) => !wanted.has(t)).length }))
    .filter((x) => x.score > 1e-9)
    .sort((a, b) => (Math.abs(b.score - a.score) > 1e-9 ? b.score - a.score : a.extra - b.extra || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0)))
    .map((x) => x.p);
}

/**
 * A chapter's catalog pieces: the best fit for its own emotions, the next two to four as alternates, and for each
 * scene the best fit for that scene's emotions (a chapter of one scene, or a scene nothing fits, plays the chapter's
 * piece). Null when fewer than one piece and two alternates fit: the chapter names none.
 */
export function matchChapter<P extends MatchablePiece>(mood: MatchMood, pieces: readonly P[]): CatalogMatch<P> | null {
  const ranked = rankCatalog(mood.emotions, pieces);
  if (ranked.length < 1 + MIN_ALTERNATES) return null;
  const [piece, ...rest] = ranked;
  const scenes = mood.scenes && mood.scenes.length ? mood.scenes : [{ emotions: mood.emotions, span: 1 }];
  const scenePieces = scenes.length === 1 ? [piece] : scenes.map((s) => rankCatalog(s.emotions, pieces)[0] ?? piece);
  return { piece, alternates: rest.slice(0, MAX_ALTERNATES), scenePieces };
}

/** A catalog piece as the scoring contract names it: spec 01's Piece, nothing of its file, license or verdict. */
export function asPiece(p: Piece): Piece {
  return { id: p.id, title: p.title, artist: p.artist, kind: p.kind, vocals: "none", moodTags: [...p.moodTags] };
}

// ---- the app's re-match of a book scored before v2 (A3: no new research run, no request) ----

/** True when the chapter's stored piece, alternates and scene pieces are all in the catalog (or it names none). */
function onCatalog(c: ChapterScore, ids: ReadonlySet<string>): boolean {
  const pl = c.playlist;
  if (!pl) return false;
  return [pl.piece, ...pl.alternates, ...(pl.scenePieces ?? [])].every((id) => ids.has(id));
}

/**
 * One stored chapter, re-matched against the catalog from its stored emotions and scenes. Only a researched
 * (`scored`) chapter whose pieces are not all catalog pieces, or that names none, changes; its old named piece becomes
 * its reference when it has none (D13: shown as "In the spirit of", never played). The listener's pick stays only when
 * it is one of the new alternates; anything else goes back to auto. Null when the chapter stays as it is.
 */
export function rematchChapter(c: ChapterScore, catalog: readonly MatchablePiece[], ids: ReadonlySet<string> = new Set(catalog.map((p) => p.id))): ChapterScore | null {
  if (c.mood.coverage !== "scored" || onCatalog(c, ids)) return null;
  const old = c.playlist ? c.pieces.find((p) => p.id === c.playlist!.piece) : undefined;
  const reference = c.reference ?? (old && !ids.has(old.id) ? asPiece(old) : undefined);
  const m = matchChapter(c.mood, catalog);
  const withRef = (x: ChapterScore): ChapterScore => (reference ? { ...x, reference } : x);
  if (!m) return c.playlist === null && c.pieces.length === 0 ? null : withRef({ mood: c.mood, pieces: [], playlist: null });
  const pieces = [m.piece, ...m.alternates, ...m.scenePieces].filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i).map(asPiece);
  const alternates = m.alternates.map((p) => p.id);
  const pick = c.playlist && c.playlist.pick !== "auto" && alternates.includes(c.playlist.pick) ? c.playlist.pick : "auto";
  const scenePieces = c.mood.scenes && c.mood.scenes.length ? { scenePieces: m.scenePieces.map((p) => p.id) } : {};
  return withRef({ mood: c.mood, pieces, playlist: { chapterIndex: c.mood.chapterIndex, piece: m.piece.id, alternates, pick, ...scenePieces } });
}

/**
 * A stored book re-matched against the catalog (rematchChapter, chapter by chapter), or null when every chapter is
 * already on it. An empty catalog changes nothing: a device that could not read the catalog keeps what it has.
 */
export function rematchScores(scores: BookScores, catalog: readonly MatchablePiece[]): BookScores | null {
  if (catalog.length === 0) return null;
  const ids = new Set(catalog.map((p) => p.id));
  let changed = false;
  const chapters = scores.chapters.map((c) => {
    const next = rematchChapter(c, catalog, ids);
    if (!next) return c;
    changed = true;
    return next;
  });
  return changed ? { ...scores, chapters } : null;
}
