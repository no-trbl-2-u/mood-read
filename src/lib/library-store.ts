// The library's state on the device: books, positions, bookmarks, per-book speed and mix, over a key-value store.
// Pure: the store is handed its key-value backend (expo-sqlite's kv-store on native, localStorage on web, a Map
// in tests), so `node --test` exercises the same code the app runs. Screens reach it through ./library.ts.
import { normalizeMix, type Mix } from "./mix.ts";
import { clamp, MAX_SPEED, MIN_SPEED, newId } from "./timeline.ts";
import type { Book, Bookmark, Chapter } from "./types.ts";

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
const posKey = (id: string) => `pos:${id}`;
const marksKey = (id: string) => `bookmarks:${id}`;
const speedKey = (id: string) => `speed:${id}`;
const mixKey = (id: string) => `mix:${id}`;

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

  let state: LibraryState = { books: sortBooks(read<Book[]>(BOOKS, [])), bookmarks: {} };
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
      kv.removeItem(posKey(id));
      kv.removeItem(marksKey(id));
      kv.removeItem(speedKey(id));
      kv.removeItem(mixKey(id));
      const { [id]: _removed, ...bookmarks } = state.bookmarks;
      state = { ...state, bookmarks };
      saveBooks(state.books.filter((b) => b.id !== id));
    },
    /**
     * Replaces a book's chapters after the listener renames, merges or splits them (spec 01 A6). The list must
     * cover the book end to end; one that does not is ignored, so a bad edit never loses audio.
     */
    setChapters(id: string, chapters: Chapter[]): void {
      const b = state.books.find((x) => x.id === id);
      if (!b || !coversBook(chapters, b.duration)) return;
      saveBooks(state.books.map((x) => (x.id === id ? { ...x, chapters } : x)));
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

    /** The book's mixer setting (A10), or the default for a book never mixed. */
    getMix: (id: string): Mix => normalizeMix(read<unknown>(mixKey(id), null)),
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
