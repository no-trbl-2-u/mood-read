// The library backup (spec 05, 05.17, A19): "Export library" writes one file, "Import library" reads it back. Pure
// over the library's key-value backend, so `node --test` runs the code the app runs; src/lib/library-backup.ts binds
// it to the device and src/lib/backup-file.ts writes and picks the file.
//
// - The file is versioned JSON: per book its details (title, author, narrator, length, each file's length, its
//   chapters as the listener left them, where it came from) and what the listener made of it (position, bookmarks,
//   speed, mix, moods and picks, their own seeds, verdicts, and how far they have reached). Never audio, never a cover,
//   never a file's name, path or ref, never the device's own book id (agents.md rule 6: the listener shares the file
//   themselves; Mood Read sends it nowhere).
// - A field is carried only when the device has it, so a book never mixed carries no mix.
// - Import matches each book to one on this shelf by 05.7's rule (src/lib/reattach.ts matchReattach: title, author,
//   length within 10 s or 1%, as many files). For a matched book the file wins for each field it carries; what it does
//   not carry stays. A book with no match is reported by title and never created: a book without audio is not a book.
// - A file that is not a Mood Read library, or is broken, is refused whole; so is one from a newer version.
import { PER_BOOK_KEYS, type Kv, type PerBookField } from "./library-store.ts";
import { matchReattach } from "./reattach.ts";
import type { Book, BookScores, BookSource, Bookmark, Chapter, ChapterScore, PieceVerdict } from "./types.ts";
import { isVerdict } from "./verdict-store.ts";

export const BACKUP_APP = "mood-read";
export const BACKUP_KIND = "library";
/** The file's format. A newer file is refused rather than half read. */
export const BACKUP_VERSION = 1;

/** The per-book fields the file carries: every per-book key but the scoring job (the proxy's, not the listener's). */
export const BACKED_UP = ["position", "bookmarks", "speed", "mix", "scores", "seeds", "verdicts", "reached"] as const satisfies readonly PerBookField[];
export type BackedUpField = (typeof BACKED_UP)[number];

export type BackupChapter = Pick<Chapter, "title" | "fileIndex" | "start" | "end">;
export type BackupBookmark = Pick<Bookmark, "id" | "position" | "name" | "createdAt">;

export type BackupBook = {
  title: string;
  author: string;
  narrator: string;
  /** Seconds, the whole book. */
  duration: number;
  /** Each file's length in seconds, in order: what 05.7's match counts, and nothing else of the files. */
  fileDurations: number[];
  chapters: BackupChapter[];
  source: BookSource;
  position?: number;
  bookmarks?: BackupBookmark[];
  speed?: number;
  mix?: Record<string, unknown>;
  scores?: BookScores;
  seeds?: ChapterScore[];
  verdicts?: PieceVerdict[];
  /** As src/lib/reached.ts keeps it. */
  reached?: unknown;
};

export type LibraryBackup = {
  app: typeof BACKUP_APP;
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  books: BackupBook[];
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function bookmarkOf(v: unknown): BackupBookmark | null {
  if (!isObj(v) || !isNum(v.position) || v.position < 0 || typeof v.name !== "string") return null;
  return {
    id: typeof v.id === "string" && v.id ? v.id : `m${Math.round(v.position * 1000)}`,
    position: v.position,
    name: v.name,
    createdAt: isNum(v.createdAt) ? v.createdAt : 0,
  };
}

/** Each carried field as it is read from a store or a file: its value, or undefined when it is not usable. */
const FIELDS: { [F in BackedUpField]: (v: unknown) => BackupBook[F] | undefined } = {
  position: (v) => (isNum(v) && v >= 0 ? v : undefined),
  speed: (v) => (isNum(v) && v > 0 ? v : undefined),
  bookmarks: (v) => (Array.isArray(v) ? v.map(bookmarkOf).filter((m): m is BackupBookmark => m !== null) : undefined),
  mix: (v) => (isObj(v) ? v : undefined),
  scores: (v) => (isObj(v) && Array.isArray(v.chapters) ? (v as BookScores) : undefined),
  seeds: (v) => (Array.isArray(v) ? (v.filter((s) => isObj(s) && isObj(s.mood)) as ChapterScore[]) : undefined),
  verdicts: (v) => (Array.isArray(v) ? v.filter(isVerdict).map(({ chapterIndex, pieceId, verdict, at }) => ({ chapterIndex, pieceId, verdict, at })) : undefined),
  reached: (v) => (isNum(v) || isObj(v) ? v : undefined),
};

function sourceOf(v: unknown): BookSource {
  if (!isObj(v) || v.kind !== "librivox" || typeof v.librivoxId !== "string") return { kind: "import" };
  const digits = (x: unknown) => (typeof x === "string" && /^\d+$/.test(x) ? x : undefined);
  const catalogId = digits(v.catalogId);
  const gutenbergId = digits(v.gutenbergId);
  return { kind: "librivox", librivoxId: v.librivoxId, ...(catalogId ? { catalogId } : {}), ...(gutenbergId ? { gutenbergId } : {}) };
}

function chaptersOf(v: unknown): BackupChapter[] {
  if (!Array.isArray(v)) return [];
  const out: BackupChapter[] = [];
  for (const c of v) {
    if (!isObj(c) || typeof c.title !== "string" || !isNum(c.start) || !isNum(c.end) || !Number.isInteger(c.fileIndex)) return [];
    out.push({ title: c.title, fileIndex: c.fileIndex as number, start: c.start, end: c.end });
  }
  return out;
}

/** One book's entry: its details and every carried field the device has for it. */
export function exportBook(kv: Pick<Kv, "getItem">, book: Book): BackupBook {
  const entry: BackupBook = {
    title: book.title,
    author: book.author,
    narrator: book.narrator,
    duration: book.duration,
    fileDurations: book.files.map((f) => f.duration),
    chapters: book.chapters.map(({ title, fileIndex, start, end }) => ({ title, fileIndex, start, end })),
    source: sourceOf(book.source),
  };
  for (const field of BACKED_UP) {
    const raw = kv.getItem(PER_BOOK_KEYS[field](book.id));
    if (raw == null) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const value = FIELDS[field](parsed);
    if (value !== undefined) (entry as Record<string, unknown>)[field] = value;
  }
  return entry;
}

/** The whole library as the file holds it, in shelf order. */
export function exportLibrary(kv: Pick<Kv, "getItem">, books: readonly Book[], now: Date = new Date()): LibraryBackup {
  return { app: BACKUP_APP, kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt: now.toISOString(), books: books.map((b) => exportBook(kv, b)) };
}

/** The file's text: indented, so a person can read it. */
export const backupText = (backup: LibraryBackup): string => JSON.stringify(backup, null, 2);

/** The file's name, dated: mood-read-library-2026-10-25.json. */
export const backupFileName = (now: Date = new Date()): string => `mood-read-library-${now.toISOString().slice(0, 10)}.json`;

export type ParsedBackup = { ok: true; backup: LibraryBackup } | { ok: false; reason: "malformed" | "newer" };

function bookOf(v: unknown): BackupBook | null {
  if (!isObj(v) || typeof v.title !== "string" || typeof v.author !== "string" || !isNum(v.duration) || v.duration <= 0) return null;
  const files = v.fileDurations;
  if (!Array.isArray(files) || files.length === 0 || !files.every((d) => isNum(d) && d >= 0)) return null;
  const entry: BackupBook = {
    title: v.title,
    author: v.author,
    narrator: typeof v.narrator === "string" ? v.narrator : "",
    duration: v.duration,
    fileDurations: files as number[],
    chapters: chaptersOf(v.chapters),
    source: sourceOf(v.source),
  };
  for (const field of BACKED_UP) {
    const value = v[field] === undefined ? undefined : FIELDS[field](v[field]);
    if (value !== undefined) (entry as Record<string, unknown>)[field] = value;
  }
  return entry;
}

/**
 * Reads a file's text. Refused whole: anything that is not a Mood Read library, or any book in it without a title,
 * author and lengths (`malformed`), and a version this app does not know (`newer`). A carried field that is broken is
 * dropped, and the rest of its book still restores.
 */
export function parseBackup(text: string): ParsedBackup {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!isObj(v) || v.app !== BACKUP_APP || v.kind !== BACKUP_KIND || !Number.isInteger(v.version) || (v.version as number) < 1) {
    return { ok: false, reason: "malformed" };
  }
  if ((v.version as number) > BACKUP_VERSION) return { ok: false, reason: "newer" };
  if (!Array.isArray(v.books)) return { ok: false, reason: "malformed" };
  const books: BackupBook[] = [];
  for (const b of v.books) {
    const entry = bookOf(b);
    if (!entry) return { ok: false, reason: "malformed" };
    books.push(entry);
  }
  return {
    ok: true,
    backup: { app: BACKUP_APP, kind: BACKUP_KIND, version: v.version as number, exportedAt: typeof v.exportedAt === "string" ? v.exportedAt : "", books },
  };
}

/** Each entry with the shelf book it restores onto (05.7's rule; one book takes one entry), and those with none. */
export function matchBooks(entries: readonly BackupBook[], books: readonly Book[]): { pairs: { entry: BackupBook; book: Book }[]; unmatched: BackupBook[] } {
  const taken = new Set<string>();
  const pairs: { entry: BackupBook; book: Book }[] = [];
  const unmatched: BackupBook[] = [];
  for (const entry of entries) {
    const found = { title: entry.title, author: entry.author, durations: entry.fileDurations };
    const book = books.find((b) => !taken.has(b.id) && matchReattach(b, found).ok);
    if (book) {
      taken.add(book.id);
      pairs.push({ entry, book });
    } else unmatched.push(entry);
  }
  return { pairs, unmatched };
}

/**
 * The entry's chapters on the shelf book, or null when it has none: the same spans, the last one ending where this
 * copy of the book ends (its length may differ by a few seconds). The library store refuses a list that does not
 * cover the book (src/lib/library-store.ts setChapters), so a bad list never loses audio.
 */
export function chaptersFor(entry: BackupBook, book: Pick<Book, "id" | "duration" | "files">): Chapter[] | null {
  if (entry.chapters.length === 0 || entry.chapters.some((c) => c.fileIndex >= book.files.length)) return null;
  const last = entry.chapters.length - 1;
  return entry.chapters.map((c, i) => ({ bookId: book.id, index: i, title: c.title, fileIndex: c.fileIndex, start: c.start, end: i === last ? book.duration : c.end }));
}

export type RestoreDeps = {
  kv: Kv;
  /** Puts the listener's chapters on the book (the library store's setChapters, which checks they cover it). */
  setChapters(bookId: string, chapters: Chapter[]): void;
  /** Tells every store holding the book to read its keys again. */
  refresh(bookId: string): void;
};

/** Writes what the entry carries onto the shelf book: the file wins for each field it carries. */
export function restoreBook(entry: BackupBook, book: Book, deps: RestoreDeps): void {
  const chapters = chaptersFor(entry, book);
  if (chapters) deps.setChapters(book.id, chapters);
  for (const field of BACKED_UP) {
    let value: unknown = entry[field];
    if (value === undefined) continue;
    if (field === "position") value = Math.min(value as number, book.duration);
    if (field === "bookmarks") value = (value as BackupBookmark[]).map((m) => ({ ...m, bookId: book.id, position: Math.min(m.position, book.duration) }));
    deps.kv.setItem(PER_BOOK_KEYS[field](book.id), JSON.stringify(value));
  }
  deps.refresh(book.id);
}

export type ImportResult =
  | { ok: true; restored: string[]; unmatched: string[] }
  | { ok: false; reason: "malformed" | "newer" };

/** "Import library": reads the file's text and restores every book it matches; the titles it could not are reported. */
export function importLibrary(text: string, books: readonly Book[], deps: RestoreDeps): ImportResult {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  const { pairs, unmatched } = matchBooks(parsed.backup.books, books);
  for (const { entry, book } of pairs) restoreBook(entry, book, deps);
  return { ok: true, restored: pairs.map((p) => p.book.title), unmatched: unmatched.map((e) => e.title) };
}
