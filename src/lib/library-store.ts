// The library's state on the device: books, positions, bookmarks, per-book speed and mix, over a key-value store.
// Pure: the store is handed its key-value backend (expo-sqlite's kv-store on native, localStorage on web, a Map
// in tests), so `node --test` exercises the same code the app runs. Screens reach it through ./library.ts.
import type { BedChoice } from "./bed.ts";
import { normalizeMix, type Mix } from "./mix.ts";
import { reachedKey } from "./reached.ts";
import { jobKey, scoresKey, seedsKey } from "./scoring-store.ts";
import { dropSoundtrackBook } from "./soundtrack-store.ts";
import { clamp, MAX_SPEED, MIN_SPEED, newId } from "./timeline.ts";
import type { Book, BookFile, Bookmark, Chapter } from "./types.ts";
import { verdictsKey } from "./verdict-store.ts";

export type Kv = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type LibraryState = {
  books: Book[];
  /** Bookmarks per book id, sorted by position; loaded on first use. */
  bookmarks: Record<string, Bookmark[]>;
};

const BOOKS = "books";
export const posKey = (id: string) => `pos:${id}`;
export const marksKey = (id: string) => `bookmarks:${id}`;
export const speedKey = (id: string) => `speed:${id}`;
export const mixKey = (id: string) => `mix:${id}`;

/**
 * Every key kept for one book, by what it holds (the soundtrack log aside: one key for every book). "Delete book"
 * removes them all; the library backup (src/lib/backup.ts, 05.17) carries all but the scoring job.
 */
export const PER_BOOK_KEYS = {
  position: posKey,
  bookmarks: marksKey,
  speed: speedKey,
  mix: mixKey,
  job: jobKey,
  scores: scoresKey,
  seeds: seedsKey,
  reached: reachedKey,
  verdicts: verdictsKey,
} as const;

export type PerBookField = keyof typeof PER_BOOK_KEYS;

/** Most recently played first, then never-played books by title. */
export function sortBooks(books: Book[]): Book[] {
  return [...books].sort((a, b) => {
    const pa = a.lastPlayedAt ?? -1;
    const pb = b.lastPlayedAt ?? -1;
    if (pa !== pb) return pb - pa;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
  });
}

/** True when the chapters run in order from 0 to the book's end with no gap or overlap. */
export function coversBook(chapters: Chapter[], duration: number): boolean {
  if (chapters.length === 0) return false;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
  if (!near(chapters[0].start, 0) || !near(chapters[chapters.length - 1].end, duration)) return false;
  return chapters.every((c, i) => c.index === i && c.end > c.start && (i === 0 || near(chapters[i - 1].end, c.start)));
}

export function createLibraryStore(kv: Kv, now: () => number = Date.now, makeId: () => string = newId) {
  function read<T>(key: string, fallback: T): T {
    try {
      const raw = kv.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  // A book saved before spec 05's contract (05.8) has no `onDevice` or `source`: it is an import, on the device.
  const loaded = read<Book[]>(BOOKS, []).map((b) => ({ ...b, source: b.source ?? { kind: "import" as const }, onDevice: b.onDevice !== false }));
  let state: LibraryState = { books: sortBooks(loaded), bookmarks: {} };
  const listeners = new Set<() => void>();

  function set(next: Partial<LibraryState>) {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  }

  function saveBooks(books: Book[]) {
    const sorted = sortBooks(books);
    kv.setItem(BOOKS, JSON.stringify(sorted));
    set({ books: sorted });
  }

  function bookmarksOf(bookId: string): Bookmark[] {
    const cached = state.bookmarks[bookId];
    if (cached) return cached;
    const loaded = read<Bookmark[]>(marksKey(bookId), []);
    // A silent cache fill: no listener runs, so it is safe inside a render's snapshot read.
    state = { ...state, bookmarks: { ...state.bookmarks, [bookId]: loaded } };
    return loaded;
  }

  function saveBookmarks(bookId: string, list: Bookmark[]) {
    const sorted = [...list].sort((a, b) => a.position - b.position);
    kv.setItem(marksKey(bookId), JSON.stringify(sorted));
    set({ bookmarks: { ...state.bookmarks, [bookId]: sorted } });
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: (): LibraryState => state,
    books: (): Book[] => state.books,
    getBook: (id: string): Book | undefined => state.books.find((b) => b.id === id),

    addBook(book: Book): void {
      saveBooks([book, ...state.books.filter((b) => b.id !== book.id)]);
    },
    removeBook(id: string): void {
      for (const key of Object.values(PER_BOOK_KEYS)) kv.removeItem(key(id));
      dropSoundtrackBook(kv, id);
      const { [id]: _removed, ...bookmarks } = state.bookmarks;
      state = { ...state, bookmarks };
      saveBooks(state.books.filter((b) => b.id !== id));
    },
    /**
     * Marks a book on or off the device (05.7, A7): "Remove download" turns it off and keeps everything else, its
     * position, bookmarks, speed, mix and every other per-book key untouched.
     */
    setOnDevice(id: string, onDevice: boolean): void {
      if (!state.books.some((b) => b.id === id && b.onDevice !== onDevice)) return;
      saveBooks(state.books.map((b) => (b.id === id ? { ...b, onDevice } : b)));
    },
    /**
     * Replaces a book's chapters after the listener renames, merges or splits them (spec 01 A6). The list must
     * cover the book end to end; one that does not is ignored, so a bad edit never loses audio. A merge or split
     * passes `moveBeds` (src/lib/bed.ts bedsAfterMerge, bedsAfterSplit) so the chapters' own beds, keyed by chapter
     * index, move with their chapters in the same edit (A32); a book never mixed has none and is left unmixed.
     */
    setChapters(id: string, chapters: Chapter[], moveBeds?: (beds: Record<string, BedChoice>) => Record<string, BedChoice>): void {
      const b = state.books.find((x) => x.id === id);
      if (!b || !coversBook(chapters, b.duration)) return;
      const stored = moveBeds ? read<unknown>(mixKey(id), null) : null;
      const beds = stored ? normalizeMix(stored).chapterBeds : {};
      // Only the beds change: a mix with no layer of its own keeps following the default soundscape setting.
      if (moveBeds && Object.keys(beds).length) {
        kv.setItem(mixKey(id), JSON.stringify({ ...(stored as object), chapterBeds: moveBeds(beds) }));
      }
      saveBooks(state.books.map((x) => (x.id === id ? { ...x, chapters } : x)));
    },
    /**
     * Replaces a book's files and chapters together (05.11, A13): splitting a one-file book into one file per
     * chapter (src/lib/split-files.ts) changes which physical file backs each chapter without moving the book's
     * timeline, so this only takes when the new files still sum to the book's own duration and the chapters
     * still cover it end to end (`coversBook`), same spirit as `setChapters`. Returns whether it took: a
     * mismatch is ignored, so a bad split never loses audio, a position or a bookmark (all kept in seconds of
     * the whole book, untouched here) — and the caller (src/lib/split-files.ts) knows to leave the original
     * file alone rather than delete audio the library never actually started pointing at.
     */
    setFiles(id: string, files: BookFile[], chapters: Chapter[]): boolean {
      const b = state.books.find((x) => x.id === id);
      if (!b) return false;
      const total = files.reduce((sum, f) => sum + f.duration, 0);
      if (Math.abs(total - b.duration) > 0.01 || !coversBook(chapters, b.duration)) return false;
      saveBooks(state.books.map((x) => (x.id === id ? { ...x, files, chapters } : x)));
      return true;
    },
    /** Marks a book finished or not (05.16, A18); position, bookmarks and everything else stay as they are. */
    setFinished(id: string, finished: boolean): void {
      if (!state.books.some((b) => b.id === id && !!b.finished !== finished)) return;
      saveBooks(state.books.map((b) => (b.id === id ? { ...b, finished } : b)));
    },
    /** Reads the book's bookmarks from the store again, after its key was written from outside (05.17's import). */
    refresh(id: string): void {
      const { [id]: _stale, ...bookmarks } = state.bookmarks;
      set({ bookmarks });
    },
    /** Marks a book as just played, which moves it to the top of the library. */
    markPlayed(id: string): void {
      if (!state.books.some((b) => b.id === id)) return;
      saveBooks(state.books.map((b) => (b.id === id ? { ...b, lastPlayedAt: now() } : b)));
    },

    getPosition: (id: string): number => {
      const p = read<number>(posKey(id), 0);
      return Number.isFinite(p) ? Math.max(0, p) : 0;
    },
    savePosition(id: string, seconds: number): void {
      if (!Number.isFinite(seconds)) return;
      kv.setItem(posKey(id), JSON.stringify(Math.max(0, seconds)));
    },

    getSpeed: (id: string): number => {
      const s = read<number>(speedKey(id), 1);
      return Number.isFinite(s) ? clamp(s, MIN_SPEED, MAX_SPEED) : 1;
    },
    saveSpeed(id: string, speed: number): void {
      kv.setItem(speedKey(id), JSON.stringify(clamp(speed, MIN_SPEED, MAX_SPEED)));
    },

    /**
     * The book's mixer setting (A10), or the default for a book never mixed. A book with no layer of its own plays
     * `fallbackBed` (the default soundscape setting, 06.3); its own choice always wins.
     */
    getMix: (id: string, fallbackBed?: BedChoice): Mix => normalizeMix(read<unknown>(mixKey(id), null), fallbackBed),
    saveMix(id: string, mix: Mix): void {
      kv.setItem(mixKey(id), JSON.stringify(normalizeMix(mix)));
    },

    bookmarks: bookmarksOf,
    addBookmark(bookId: string, position: number, name: string): Bookmark {
      const mark: Bookmark = { id: makeId(), bookId, position: Math.max(0, position), name: name.trim(), createdAt: now() };
      saveBookmarks(bookId, [...bookmarksOf(bookId), mark]);
      return mark;
    },
    /** Renames a bookmark; an empty name keeps the old one. */
    renameBookmark(bookId: string, markId: string, name: string): void {
      const trimmed = name.trim();
      if (!trimmed) return;
      saveBookmarks(
        bookId,
        bookmarksOf(bookId).map((m) => (m.id === markId ? { ...m, name: trimmed } : m)),
      );
    },
    deleteBookmark(bookId: string, markId: string): void {
      saveBookmarks(
        bookId,
        bookmarksOf(bookId).filter((m) => m.id !== markId),
      );
    },
  };
}

export type LibraryStore = ReturnType<typeof createLibraryStore>;
