// Sizes a book's files on this device, for the storage meter (05.6, A6). Not unit tested, like src/lib/media.ts:
// a thin wrapper over expo-file-system's native module. Web uses storage-size.web.ts.
import { File } from 'expo-file-system';

import type { Book } from './types';

/** Every book's files, summed; null if any file's size can't be read, so one bad ref doesn't blank the meter. */
export function booksStorageBytes(books: Pick<Book, 'files'>[]): number | null {
  let total = 0;
  for (const book of books) {
    for (const f of book.files) {
      const size = new File(f.ref).size;
      if (size == null) return null;
      total += size;
    }
  }
  return total;
}
