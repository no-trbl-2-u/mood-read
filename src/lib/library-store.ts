// The library's state on the device: books, positions, bookmarks and per-book speed, over a key-value store.
// Pure: the store is handed its key-value backend (expo-sqlite's kv-store on native, localStorage on web, a Map
// in tests), so `node --test` exercises the same code the app runs. Screens reach it through ./library.ts.
import { clamp, MAX_SPEED, MIN_SPEED, newId } from "./timeline.ts";
import type { Book, Bookmark } from "./types.ts";

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

/** Most recently played first, then never-played books by title. */
export function sortBooks(books: Book[]): Book[] {
  return [...books].sort((a, b) => {
    const pa = a.lastPlayedAt ?? -1;
    const pb = b.lastPlayedAt ?? -1;
    if (pa !== pb) return pb - pa;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
  });
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
      const { [id]: _removed, ...bookmarks } = state.bookmarks;
      state = { ...state, bookmarks };
      saveBooks(state.books.filter((b) => b.id !== id));
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
