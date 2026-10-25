// Which chapters the listener has reached (01.4, spec 01 A21): a chapter's emotions show only once it is reached.
// The rule: a chapter is reached once playback has entered it. Per book the device keeps the furthest point in the
// book's audio that playback has entered a chapter at (that chapter's start, in seconds); a chapter is reached when
// its start is at or before that point, or when it is the chapter playing now. Going back never un-reaches a
// chapter; jumping ahead by tapping a later row reaches it (the listener chose to go there). Seconds rather than an
// index, so a split or merge of chapters (01.6) keeps what was reached. Pure: over the library's key-value backend.
//
// Scenes (07.2, spec 07 A2): a scene shows only once the clock has reached its start in that chapter. Beside the
// furthest chapter start the device keeps the furthest place (book seconds) reached within the playing chapter, one
// chapter at a time: moving into another chapter starts its own place there. Stored under the same key as
// `{ start, chapter: { start, position } }`; the shape before 07.2, a bare chapter start, still reads (no place yet).
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

/** The place within the playing chapter is written at most once per this many seconds of listening. */
export const REACH_STEP_S = 1;

/**
 * True when a scene starting at `sceneStart` (book seconds) is reached: the clock has been at or past it in this
 * chapter (`furthestIn`, the stored furthest place within the playing chapter, or null), or the clock (`position`)
 * is at or past it now.
 */
export function isSceneReached(sceneStart: number, furthestIn: number | null, position: number | null): boolean {
  const mark = Math.max(furthestIn ?? -Infinity, position ?? -Infinity);
  return sceneStart <= mark + SLACK;
}

type Stored = { start: number | null; chapter: { start: number; position: number } | null };

const isPlace = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** What the key holds: a bare chapter start (before 07.2), or the start and the place within the playing chapter. */
function parse(raw: string | null): Stored {
  const none: Stored = { start: null, chapter: null };
  if (raw == null) return none;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return none;
  }
  if (typeof v === "number" || typeof v === "string") {
    const n = Number(v);
    return { start: isPlace(n) ? n : null, chapter: null };
  }
  if (!v || typeof v !== "object") return none;
  const r = v as { start?: unknown; chapter?: { start?: unknown; position?: unknown } | null };
  const c = r.chapter;
  const chapter = c && typeof c === "object" && isPlace(c.start) && isPlace(c.position) ? { start: c.start, position: c.position } : null;
  return { start: isPlace(r.start) ? r.start : null, chapter };
}

export function createReachedStore(kv: Kv) {
  const listeners = new Set<() => void>();
  const cache = new Map<string, Stored>();

  function read(bookId: string): Stored {
    if (cache.has(bookId)) return cache.get(bookId)!;
    let v: Stored;
    try {
      v = parse(kv.getItem(reachedKey(bookId)));
    } catch {
      v = { start: null, chapter: null };
    }
    cache.set(bookId, v);
    return v;
  }

  function write(bookId: string, next: Stored) {
    kv.setItem(reachedKey(bookId), JSON.stringify(next));
    cache.set(bookId, next);
    listeners.forEach((l) => l());
  }

  const sameChapter = (a: number, b: number) => Math.abs(a - b) <= SLACK;

  return {
    subscribe(l: () => void): () => void {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    /** The furthest chapter start playback has entered in this book, in seconds, or null. */
    furthest(bookId: string): number | null {
      return read(bookId).start;
    },
    /** The furthest place (book seconds) reached within `chapter`, or null when it is not the chapter recorded. */
    furthestIn(bookId: string, chapter: Pick<Chapter, "start">): number | null {
      const c = read(bookId).chapter;
      return c && sameChapter(c.start, chapter.start) ? c.position : null;
    },
    /** Playback has entered `chapter`: it, and every chapter before it, are reached from now on. Never moves back. */
    reach(bookId: string, chapter: Pick<Chapter, "start">) {
      const was = read(bookId);
      if (!isPlace(chapter.start)) return;
      if (was.start !== null && chapter.start <= was.start) return;
      write(bookId, { ...was, start: chapter.start });
    },
    /**
     * The clock is at `position` in `chapter` (07.2): the chapter is reached, and its furthest place moves up to
     * `position` (written once per REACH_STEP_S). A place outside the chapter is ignored; another chapter starts
     * its own place.
     */
    reachAt(bookId: string, chapter: Pick<Chapter, "start" | "end">, position: number) {
      if (!isPlace(chapter.start) || !Number.isFinite(position)) return;
      if (position < chapter.start - SLACK || position > chapter.end + SLACK) return;
      const was = read(bookId);
      const start = was.start !== null && was.start >= chapter.start ? was.start : chapter.start;
      const here = was.chapter && sameChapter(was.chapter.start, chapter.start) ? was.chapter : null;
      if (here && position < here.position + REACH_STEP_S && start === was.start) return;
      write(bookId, { start, chapter: { start: chapter.start, position: here ? Math.max(here.position, position) : position } });
    },
    /** Reads the book's key from the store again, after it was written from outside (05.17's import). */
    refresh(bookId: string) {
      cache.delete(bookId);
      listeners.forEach((l) => l());
    },
    forget(bookId: string) {
      kv.removeItem(reachedKey(bookId));
      cache.set(bookId, { start: null, chapter: null });
      listeners.forEach((l) => l());
    },
  };
}

export type ReachedStore = ReturnType<typeof createReachedStore>;
