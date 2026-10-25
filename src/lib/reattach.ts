// A book's file comes back after "Remove download" (spec 05, 05.7, A7). Pure, so `node --test` runs it.
//
// - An imported book asks for its file again (matchReattach): the picked copy must carry the book's title and author
//   (compared without case, accents or punctuation) and run as long as the book did, within DURATION_TOLERANCE, in as
//   many files as before. A mismatch names what differs and nothing is attached.
// - Either way the book keeps what the listener made of it (withFiles): its chapters (and their edits), its files'
//   durations and its total, so its position, bookmarks, moods, picks and mix land where they were. Only the files'
//   refs change, and it is on the device again. A LibriVox book that comes back in a different number of files (its
//   archive.org item was re-cut) takes the new chapters and keeps when it was added and last played.
import type { Book, BookFile } from "./types.ts";

/**
 * How far a re-picked copy's length may drift from the book's and still be the same book: 10 seconds, or 1% of a
 * longer book. Two rips of one recording differ by encoder padding (well under a second per file); a different edition
 * or reader differs by minutes.
 */
export const DURATION_TOLERANCE = { seconds: 10, fraction: 0.01 };

export function durationsMatch(expected: number, found: number): boolean {
  if (!Number.isFinite(expected) || !Number.isFinite(found)) return false;
  const slack = Math.max(DURATION_TOLERANCE.seconds, expected * DURATION_TOLERANCE.fraction);
  return Math.abs(expected - found) <= slack;
}

/** A title or author as the match reads it: no case, accents, punctuation or extra spaces. */
export function matchText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type ReattachCheck = { ok: true } | { ok: false; reason: "title" | "author" | "files" | "duration" };

/** Whether a picked copy (its tags' title and author, each file's duration in order) is this book's file. */
export function matchReattach(
  book: Pick<Book, "title" | "author" | "duration" | "files">,
  found: { title: string; author: string; durations: number[] },
): ReattachCheck {
  if (matchText(book.title) !== matchText(found.title)) return { ok: false, reason: "title" };
  if (matchText(book.author) !== matchText(found.author)) return { ok: false, reason: "author" };
  if (found.durations.length !== book.files.length) return { ok: false, reason: "files" };
  const total = found.durations.reduce((s, d) => s + d, 0);
  if (!durationsMatch(book.duration, total)) return { ok: false, reason: "duration" };
  return { ok: true };
}

/** The book with its files back on the device: the same book, its files' refs (and names) replaced. */
export function withFiles(book: Book, files: Pick<BookFile, "ref" | "name">[], cover?: string | null): Book {
  return {
    ...book,
    files: book.files.map((f, i) => ({ ...f, ref: files[i]?.ref ?? f.ref, name: files[i]?.name ?? f.name })),
    cover: cover === undefined ? book.cover : (cover ?? book.cover),
    onDevice: true,
  };
}

/**
 * A LibriVox book downloaded again (A7's one tap): the shelf's copy with the fresh files, when the item still has as
 * many; else the fresh book, keeping when the shelf's copy was added and last played. No shelf copy: the fresh book.
 */
export function redownloaded(prior: Book | undefined, fresh: Book): Book {
  if (!prior) return fresh;
  if (prior.files.length === fresh.files.length) return { ...withFiles(prior, fresh.files, fresh.cover), source: fresh.source };
  return { ...fresh, addedAt: prior.addedAt, lastPlayedAt: prior.lastPlayedAt };
}
