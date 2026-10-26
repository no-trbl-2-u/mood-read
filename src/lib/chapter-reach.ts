// What playback entering a chapter does (spec 01 A21, spec 07 A2 and A9; audit 4.2): the chapter is reached, the place
// within it moves up, and the piece that plays for it is logged to "Your soundtrack". It is decided here, from what
// the player sees, and run by the player (src/player/PlayerProvider.tsx), not by a screen, so playback that rolls into
// the next chapter while the listener is on another screen reaches it all the same. Each step is idempotent in its
// store (a repeat writes nothing and tells no listener), so running it on every tick, or from two places, never logs
// a piece twice. Pure: the stores come in as `deps`, so `node --test` exercises the code the app runs.
import { piecesPlayed } from "./soundtrack-store.ts";
import type { Chapter, ChapterScore } from "./types.ts";

/** What the player sees now: the open book, the chapter and place it is at, and the book's scores. */
export type PlaybackSeen = {
  bookId: string | null | undefined;
  chapter: Pick<Chapter, "index" | "title" | "start" | "end"> | undefined;
  /** The clock, in book seconds; null when there is none. */
  position: number | null;
  scores: readonly ChapterScore[];
};

export type PlaybackDeps = {
  reach: (bookId: string, chapter: Pick<Chapter, "start">) => void;
  reachAt: (bookId: string, chapter: Pick<Chapter, "start" | "end">, position: number) => void;
  furthestIn: (bookId: string, chapter: Pick<Chapter, "start">) => number | null;
  log: (bookId: string, pieceIds: readonly string[]) => void;
};

export function recordPlayback({ bookId, chapter, position, scores }: PlaybackSeen, deps: PlaybackDeps): void {
  if (!bookId || !chapter) return;
  // Playback has entered this chapter: it is reached from now on, and stays reached (src/lib/reached.ts, A21).
  deps.reach(bookId, chapter);
  // And the furthest place within it (07.2, A2): a scene shows only once the clock has reached its start.
  if (position !== null) deps.reachAt(bookId, chapter, position);
  // The reached chapter's piece plays for it, and the pieces of its scenes reached so far (07.8, A9; 07.2, A2).
  const score = scores.find((s) => s.mood.chapterIndex === chapter.index && s.mood.chapterTitle === chapter.title);
  if (score) deps.log(bookId, piecesPlayed(score, { chapter, position, furthestIn: deps.furthestIn(bookId, chapter) }));
}
