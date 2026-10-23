// Data shapes for the player (spec 01, Contracts). Later chunks extend these (moods, playlists, mix).

/** One audio file of a book, in play order. `ref` is resolved to a playable URI by the media store. */
export type BookFile = {
  ref: string;
  name: string;
  /** Seconds. */
  duration: number;
};

export type Chapter = {
  /** The book this chapter belongs to. */
  bookId: string;
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
  /** The cover from the files' tags, as a stored ref (resolved by the media store), if any. */
  cover: string | null;
  files: BookFile[];
  chapters: Chapter[];
  /** Seconds, the sum of the files. */
  duration: number;
  addedAt: number;
  /** When the listener last opened it to play (ms since epoch); the library sorts on it. */
  lastPlayedAt: number | null;
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
  | { kind: 'chapterEnd'; chapterIndex: number; end: number };

/** A bed loop (spec 01, Contracts). `loop` is a bundled asset (a `require` of a file in `assets/`) or a URI. */
export type Soundscape = {
  id: string;
  name: string;
  loop: number | string;
  /** The loop's length in seconds, so the bed can sit at the right place in it. */
  loopSeconds: number;
};
