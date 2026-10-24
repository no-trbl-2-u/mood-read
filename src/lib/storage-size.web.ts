// The web build keeps books' bytes in IndexedDB (src/lib/media.web.ts), which has no reliable per-book size API,
// so the storage meter says so instead of guessing (spec 05: "the web build streams"; A6).
import type { Book } from './types';

export function booksStorageBytes(_books: Pick<Book, 'files'>[]): number | null {
  return null;
}
