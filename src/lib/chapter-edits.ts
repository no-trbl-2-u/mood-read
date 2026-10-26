// The listener's chapter edits (spec 01 A6), saved for the book. A chapter's own bed (A32) and its kept verdicts
// (07.4, audit 4.0) are keyed by chapter index, so a merge or split moves them with their chapters in the same edit.
// Bound to the library and the verdicts here, so neither module imports the other.
import { bedsAfterMerge, bedsAfterSplit } from "./bed";
import { canMergeWithNext, canSplitAt, mergeWithNext, renameChapter, splitChapter } from "./chapters";
import { library } from "./library";
import type { Book } from "./types";
import { verdicts } from "./verdicts";

/** True when the library took the new list (one that does not cover the book is ignored). */
const took = (bookId: string, before: Book["chapters"]) => library.getBook(bookId)?.chapters !== before;

export const chapterEdits = {
  rename(book: Book, index: number, title: string): void {
    library.setChapters(book.id, renameChapter(book.chapters, index, title));
  },
  mergeWithNext(book: Book, index: number): void {
    if (!canMergeWithNext(book.chapters, index)) return;
    const before = library.getBook(book.id)?.chapters;
    library.setChapters(book.id, mergeWithNext(book.chapters, book.files, index), (beds) => bedsAfterMerge(beds, index));
    if (before && took(book.id, before)) verdicts.afterMerge(book.id, index);
  },
  splitAt(book: Book, position: number): void {
    if (!canSplitAt(book.chapters, position)) return;
    const index = book.chapters.findIndex((c) => position >= c.start && position < c.end);
    const before = library.getBook(book.id)?.chapters;
    library.setChapters(book.id, splitChapter(book.chapters, book.files, position), (beds) => bedsAfterSplit(beds, index));
    if (before && took(book.id, before)) verdicts.afterSplit(book.id, index);
  },
};
