// Library management on this device (spec 05, 05.7, A7, A8), for the screens: "Remove download" and "Delete book"
// (src/lib/book-removal.ts, bound here to the library, the playlists, the download queue and the file helpers), and
// bringing a removed book's file back: a LibriVox book downloads again in one tap through the download queue; an
// imported one asks for its file and matches it by title, author and duration (src/lib/reattach.ts). Storage is
// reached only through src/lib/ (agents.md rule 7).
import { Platform } from "react-native";

import { createBookRemoval, newlyOnDevice } from "./book-removal";
import { downloadQueue, downloadStore } from "./downloads";
import { bookTags, checkImport, inspectFiles } from "./import-plan";
import { library } from "./library";
import { getItem } from "./librivox-api";
import { forgetLibriVoxBook, pendingBookFrom, stashLibriVoxBook } from "./librivox-download";
import { deleteBookFiles, deletePieceFile, deleteStoredFiles, probeDuration, resolveFile, storeFile, type PickedAudio } from "./media";
import type { DrmKind } from "./meta/types";
import { playlistStore } from "./playlists";
import { matchReattach, withFiles, type ReattachCheck } from "./reattach";
import type { Book } from "./types";

const removal = createBookRemoval({
  library,
  playlists: playlistStore,
  downloads: { list: downloadStore.list, remove: downloadQueue.remove },
  files: { deleteAudio: deleteStoredFiles, deleteBook: deleteBookFiles, deletePiece: deletePieceFile },
  forgetPending: forgetLibriVoxBook,
});

export const removeDownload = removal.removeDownload;
export const deleteBook = removal.deleteBook;

/**
 * How many books stay on the device: one in a browser, which caps what a site may store and may evict it unannounced
 * (spec 05 Design, "The web build streams; phones keep"), every book on a phone. The Downloads screen says so.
 */
export const MAX_DEVICE_BOOKS = Platform.OS === "web" ? 1 : Infinity;

// A book that lands on the web build (an import, a LibriVox download, a found file) takes the place of the book that
// was there: that one goes through "Remove download" (A7), so it stays on the shelf, "Not on device", with its position,
// bookmarks, moods, picks and mix, and a LibriVox book downloads again in one tap. Watching the library's own changes
// covers every path that adds a book. Books already over the cap when the app opens are left as they are: nothing is
// removed that the listener did not just replace. Native builds have no cap and never watch.
if (Number.isFinite(MAX_DEVICE_BOOKS)) {
  const seen = new Set<string>();
  newlyOnDevice(seen, library.books());
  library.subscribe(() => {
    const landed = newlyOnDevice(seen, library.books());
    if (landed.length > 0) void removal.enforceLimit(landed, MAX_DEVICE_BOOKS).catch(() => {});
  });
}

/**
 * "Download again" (A7): a removed LibriVox book's chapter files, queued under the book's own id, so it lands back on
 * the same book (src/lib/librivox-download.ts keeps its chapters and history). Rejects when archive.org can't be read.
 */
export async function downloadAgain(book: Book): Promise<void> {
  if (book.source.kind !== "librivox" || book.onDevice) return;
  const item = await getItem((url, init) => fetch(url, init), book.source.librivoxId);
  const pending = pendingBookFrom(item);
  if (pending.files.length === 0) throw new Error("archive.org lists no chapter files for this book");
  for (const d of downloadStore.list()) if (d.target.kind === "book" && d.target.bookId === book.id) downloadQueue.remove(d.id);
  stashLibriVoxBook(book.id, pending);
  downloadQueue.enqueue({ kind: "book", bookId: book.id });
}

export type FindOutcome =
  | { kind: "attached" }
  | { kind: "mismatch"; reason: Extract<ReattachCheck, { ok: false }>["reason"] }
  | { kind: "drm"; fileName: string; drm: DrmKind }
  | { kind: "unsupported"; fileName: string }
  | { kind: "empty" }
  | { kind: "cancelled" };

/**
 * "Find the file" (A7): the picked files, read as an import reads them, attach to the removed book only when their
 * tags' title and author and their length match it; otherwise nothing is kept and the outcome says what differs.
 */
export async function findTheFile(book: Book, picked: PickedAudio[] | null): Promise<FindOutcome> {
  if (!picked) return { kind: "cancelled" };
  const stored: string[] = [];
  try {
    const check = checkImport(await inspectFiles(picked));
    if (check.kind !== "ok") return check;
    const tags = bookTags(check.files);
    // Cheap refusals first, before a byte is copied.
    const early = matchReattach(book, { ...tags, durations: book.files.map((f) => f.duration) });
    if (!early.ok) return { kind: "mismatch", reason: early.reason };
    if (check.files.length !== book.files.length) return { kind: "mismatch", reason: "files" };

    const files: { ref: string; name: string }[] = [];
    const durations: number[] = [];
    for (let i = 0; i < check.files.length; i++) {
      const { file, meta } = check.files[i];
      const ref = await storeFile(book.id, i, file);
      stored.push(ref);
      let duration: number;
      try {
        duration = await probeDuration(await resolveFile(ref));
      } catch (e) {
        if (!meta.duration) throw e;
        duration = meta.duration;
      }
      files.push({ ref, name: file.name });
      durations.push(duration);
    }
    const match = matchReattach(book, { ...tags, durations });
    if (!match.ok) {
      await deleteStoredFiles(stored).catch(() => {});
      return { kind: "mismatch", reason: match.reason };
    }
    library.addBook(withFiles(book, files));
    return { kind: "attached" };
  } catch {
    await deleteStoredFiles(stored).catch(() => {});
    return { kind: "unsupported", fileName: "" };
  } finally {
    for (const f of picked) f.source.close?.();
  }
}
