// "Set the mood" (07.6, spec 07 A7): a listener seeds a mood for an unscored book or chapter, and a piece the device
// already knows is matched to it here, on the device, by its mood tags. Nothing goes to the proxy: this file reads
// only what it is handed, the pieces named in the scored books the device keeps (and, once the device keeps the music
// catalog's manifest, its pieces too: `extra`). With no piece to match, the chapter plays its soundscape. Pure.
import { strongest } from "./mood-card.ts";
import type { BookScores, Chapter, ChapterScore, Emotion, EmotionScore, Piece } from "./types.ts";

/** One tap lights an emotion low, two high (spec 07, Design); a third clears it. */
export const SEED_LOW = 0.4;
export const SEED_HIGH = 0.8;
/** Up to three emotions lit at once. */
export const MAX_SEED = 3;
/** The version a seed carries in its ChapterMood (its `model` is "listener"). */
export const SEED_VERSION = "07.6";

export type SeedLevel = "off" | "low" | "high";

/** How an emotion stands in the sheet's draft. */
export function seedLevel(draft: readonly EmotionScore[], emotion: Emotion): SeedLevel {
  const at = draft.find((e) => e.emotion === emotion);
  if (!at) return "off";
  return at.intensity >= SEED_HIGH ? "high" : "low";
}

/** One tap on an emotion's chip: off to low, low to high, high to off. An unlit chip does nothing once three are lit. */
export function tapSeed(draft: readonly EmotionScore[], emotion: Emotion): EmotionScore[] {
  const level = seedLevel(draft, emotion);
  if (level === "off") return draft.length >= MAX_SEED ? (draft as EmotionScore[]) : [...draft, { emotion, intensity: SEED_LOW }];
  if (level === "low") return draft.map((e) => (e.emotion === emotion ? { emotion, intensity: SEED_HIGH } : e));
  return draft.filter((e) => e.emotion !== emotion);
}

/** A kept seed as a draft, so the sheet opens as the listener left it: above the midpoint reads high. */
export function draftFrom(emotions: readonly EmotionScore[]): EmotionScore[] {
  const mid = (SEED_LOW + SEED_HIGH) / 2;
  return emotions.slice(0, MAX_SEED).map((e) => ({ emotion: e.emotion, intensity: e.intensity >= mid ? SEED_HIGH : SEED_LOW }));
}

/**
 * The pieces this device already knows: every piece named in a researched chapter of any stored book, then `extra`
 * (pieces held besides them), each id once, never one with vocals (A20). A seed's own piece is not counted again.
 */
export function knownPieces(books: readonly (Pick<BookScores, "chapters"> | null)[], extra: readonly Piece[] = []): Piece[] {
  const seen = new Map<string, Piece>();
  const add = (p: Piece) => {
    if (p.vocals === "none" && Array.isArray(p.moodTags) && !seen.has(p.id)) seen.set(p.id, p);
  };
  for (const b of books) for (const c of b?.chapters ?? []) if (c.mood.coverage === "scored") c.pieces.forEach(add);
  extra.forEach(add);
  return [...seen.values()];
}

/**
 * The piece for a seed: the one whose mood tags cover the most lit intensity; on a tie the one with fewer tags beside
 * the lit emotions (the closer fit), then the first known. Null when no piece shares a lit emotion.
 */
export function matchPiece(lit: readonly EmotionScore[], pool: readonly Piece[]): Piece | null {
  const want = new Map(lit.map((e) => [e.emotion, e.intensity]));
  let best: { piece: Piece; score: number; extra: number } | null = null;
  for (const piece of pool) {
    const score = piece.moodTags.reduce((sum, t) => sum + (want.get(t) ?? 0), 0);
    if (score <= 0) continue;
    const extra = piece.moodTags.filter((t) => !want.has(t)).length;
    if (!best || score > best.score || (score === best.score && extra < best.extra)) best = { piece, score, extra };
  }
  return best?.piece ?? null;
}

/**
 * The seed as the device keeps it: a ChapterMood with `coverage: "listener"` and no sources, the lit emotions
 * strongest first, and the matched piece as the chapter's one piece (no alternates), or no playlist at all.
 */
export function seedScore(chapter: Pick<Chapter, "index" | "title">, lit: readonly EmotionScore[], match: Piece | null, now: number): ChapterScore {
  return {
    mood: {
      chapterIndex: chapter.index,
      chapterTitle: chapter.title,
      emotions: strongest(lit),
      sources: [],
      coverage: "listener",
      model: "listener",
      version: SEED_VERSION,
      scoredAt: now,
    },
    pieces: match ? [match] : [],
    playlist: match ? { chapterIndex: chapter.index, piece: match.id, alternates: [], pick: "auto" } : null,
  };
}
