// A book's fingerprint on the shelf (07.7, spec 07 A8): its strongest emotions over the chapters the listener has
// reached, and the shelf's Mood filter over them. Pure: it reads what the device already keeps, a book's stored
// scores (`scores:`, src/lib/scoring-store.ts) and how far it has been reached (`reached:`, src/lib/reached.ts).
// Unreached chapters never count (spec 01 A21 at the shelf), so the shelf never tells the listener how a book
// feels further on than they have been.
import { isReached } from "./reached.ts";
import { EMOTIONS, type BookScores, type Chapter, type ChapterMood, type Emotion, type EmotionScore } from "./types.ts";

/** A fingerprint shows at most this many emotions (spec 07, Decisions). */
export const FINGERPRINT_SIZE = 3;

/**
 * The coverages a fingerprint counts, most preferred first: the book counts only its chapters of the first coverage
 * any of its chapters has, so a listener's seed never mixes with a researched mood unless the book has no
 * researched chapter (spec 07, Decisions): 07.6's `coverage: "listener"` comes after "scored".
 */
export const FINGERPRINT_COVERAGE: readonly ChapterMood["coverage"][] = ["scored", "listener"];

/**
 * The book's fingerprint: per emotion, the sum of its intensities across the reached chapters, strongest first
 * (ties in the fixed emotion order), at most FINGERPRINT_SIZE. `furthest` is the stored furthest chapter start
 * (src/lib/reached.ts) and `playing` the chapter playing now, which counts as reached, as on the river. A stored
 * score counts only while its chapter keeps the title it was scored under. Empty when no reached chapter is scored.
 */
export function fingerprint(
  book: { chapters: readonly Pick<Chapter, "index" | "title" | "start">[] },
  scores: Pick<BookScores, "chapters"> | null,
  furthest: number | null,
  playing?: Pick<Chapter, "start"> | null,
): EmotionScore[] {
  if (!scores) return [];
  const moods = book.chapters.flatMap((c) => {
    const s = scores.chapters.find((x) => x.mood.chapterIndex === c.index && x.mood.chapterTitle === c.title);
    return s ? [{ chapter: c, mood: s.mood }] : [];
  });
  const coverage = FINGERPRINT_COVERAGE.find((k) => moods.some((m) => m.mood.coverage === k));
  const sums = new Map<Emotion, number>();
  for (const { chapter, mood } of moods) {
    if (mood.coverage !== coverage || !isReached(chapter, furthest, playing)) continue;
    for (const { emotion, intensity } of mood.emotions) {
      if (!EMOTIONS.includes(emotion) || !Number.isFinite(intensity) || intensity <= 0) continue;
      sums.set(emotion, (sums.get(emotion) ?? 0) + intensity);
    }
  }
  return EMOTIONS.filter((emotion) => sums.has(emotion))
    .map((emotion) => ({ emotion, intensity: sums.get(emotion)! }))
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, FINGERPRINT_SIZE);
}

/**
 * The Mood filter: with no emotion lit, every item in its order; with one lit, only the items whose fingerprint
 * holds it, strongest match first (its summed intensity), ties in the given order.
 */
export function moodFilter<T>(items: readonly { item: T; print: readonly EmotionScore[] }[], lit: Emotion | null): T[] {
  if (lit === null) return items.map((x) => x.item);
  return items
    .flatMap((x) => {
      const match = x.print.find((p) => p.emotion === lit);
      return match ? [{ item: x.item, strength: match.intensity }] : [];
    })
    .sort((a, b) => b.strength - a.strength)
    .map((x) => x.item);
}

/** The emotions the filter offers: those some fingerprint holds, in the fixed order, and the lit one, so it can be cleared. */
export function filterEmotions(prints: readonly (readonly EmotionScore[])[], lit: Emotion | null): Emotion[] {
  const held = new Set(prints.flatMap((p) => p.map((x) => x.emotion)));
  return EMOTIONS.filter((emotion) => held.has(emotion) || emotion === lit);
}
