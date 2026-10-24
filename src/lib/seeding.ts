// "Set the mood" on this device (07.6, spec 07 A7), for the screens: the listener's seed is matched to a piece the
// device already knows (src/lib/mood-match.ts) and kept by the scoring store (src/lib/scoring-store.ts), and the
// river reads a book's chapters with its seeds. Nothing here makes a request: a seed never leaves the device.
import { useSyncExternalStore } from "react";

import { library } from "./library";
import { knownPieces, matchPiece, seedScore } from "./mood-match";
import { scoringStore } from "./scoring";
import { seedable } from "./scoring-store";
import type { Book, ChapterScore, EmotionScore, Piece } from "./types";

/** A book's chapters as the river, the bed and the shelf read them: the research, with the listener's seeds. */
export function useChapterScores(bookId: string): ChapterScore[] {
  const read = () => scoringStore.chapters(bookId);
  return useSyncExternalStore(scoringStore.subscribe, read, read);
}

/**
 * Seeds `lit` on one chapter, or on every chapter of the book the research has not scored, matched to a piece named
 * in any scored book on the device. The catalog manifest is not kept on the device (src/lib/catalog-config.ts reads
 * it per screen), so it does not join the pool yet. Returns the matched piece, or null: the soundscape plays.
 */
export function setMood(book: Pick<Book, "id" | "chapters">, target: { chapter: number } | "book", lit: readonly EmotionScore[], now = Date.now()): Piece | null {
  const pool = knownPieces(library.books().map((b) => scoringStore.scores(b.id)));
  const match = matchPiece(lit, pool);
  const open = seedable(book.chapters, scoringStore.scores(book.id));
  const chapters = target === "book" ? open : open.filter((c) => c.index === target.chapter);
  if (chapters.length > 0 && lit.length > 0) scoringStore.seed(book.id, chapters.map((c) => seedScore(c, lit, match, now)));
  return match;
}
