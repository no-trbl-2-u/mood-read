// Data shapes for the player (spec 01, Contracts). Later chunks extend these (moods, playlists, mix).

/** One audio file of a book, in play order. `ref` is resolved to a playable URI by the media store. */
export type BookFile = {
  ref: string;
  name: string;
  /** Seconds. */
  duration: number;
};

export type Chapter = {
  index: number;
  title: string;
  /** Which file this chapter plays from. */
  fileIndex: number;
  /** Seconds within the whole book's audio. */
  start: number;
  end: number;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  narrator: string;
  /** Cover image URI, if any (tags and covers arrive with 01.6). */
  cover: string | null;
  source: 'local' | 'audible';
  files: BookFile[];
  chapters: Chapter[];
  /** Seconds, the sum of the files. */
  duration: number;
  addedAt: number;
};

export type Bookmark = {
  id: string;
  bookId: string;
  /** Seconds within the whole book. */
  position: number;
  name: string;
  createdAt: number;
};

export type SleepTimer =
  | { kind: 'minutes'; minutes: number; endsAt: number }
  | { kind: 'chapterEnd'; chapterIndex: number };
