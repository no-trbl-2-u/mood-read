// Which chapters the listener has reached (01.4, spec 01 A21): a chapter's emotions show only once it is reached.
// The rule: a chapter is reached once playback has entered it. Per book the device keeps the furthest point in the
// book's audio that playback has entered a chapter at (that chapter's start, in seconds); a chapter is reached when
// its start is at or before that point, or when it is the chapter playing now. Going back never un-reaches a
// chapter; jumping ahead by tapping a later row reaches it (the listener chose to go there). Seconds rather than an
// index, so a split or merge of chapters (01.6) keeps what was reached. Pure: over the library's key-value backend.
import type { Kv } from "./library-store.ts";
import type { Chapter } from "./types.ts";

export const reachedKey = (bookId: string) => `reached:${bookId}`;

/** A little slack, so a chapter whose start equals the furthest point (to float noise) counts as reached. */
const SLACK = 0.001;

/**
 * True when the listener has reached this chapter: playback has entered it before (its start is at or before
 * `furthest`, the stored furthest chapter start, or null when nothing was recorded), or it is the playing chapter.
 */
export function isReached(chapter: Pick<Chapter, "start">, furthest: number | null, playing?: Pick<Chapter, "start"> | null): boolean {
  const mark = Math.max(furthest ?? -Infinity, playing?.start ?? -Infinity);
  return chapter.start <= mark + SLACK;
}

export function createReachedStore(kv: Kv) {
  const listeners = new Set<() => void>();
  const cache = new Map<string, number | null>();

  function furthest(bookId: string): number | null {
    if (cache.has(bookId)) return cache.get(bookId)!;
    let v: number | null = null;
    try {
      const raw = kv.getItem(reachedKey(bookId));
      const n = raw == null ? NaN : Number(JSON.parse(raw));
      v = Number.isFinite(n) && n >= 0 ? n : null;
    } catch {
      v = null;
    }
    cache.set(bookId, v);
    return v;
  }

  return {
    subscribe(l: () => void): () => void {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    /** The furthest chapter start playback has entered in this book, in seconds, or null. */
    furthest,
    /** Playback has entered `chapter`: it, and every chapter before it, are reached from now on. Never moves back. */
    reach(bookId: string, chapter: Pick<Chapter, "start">) {
      const was = furthest(bookId);
      if (!Number.isFinite(chapter.start) || chapter.start < 0) return;
      if (was !== null && chapter.start <= was) return;
      kv.setItem(reachedKey(bookId), JSON.stringify(chapter.start));
      cache.set(bookId, chapter.start);
      listeners.forEach((l) => l());
    },
    forget(bookId: string) {
      kv.removeItem(reachedKey(bookId));
      cache.set(bookId, null);
      listeners.forEach((l) => l());
    },
  };
}

export type ReachedStore = ReturnType<typeof createReachedStore>;
