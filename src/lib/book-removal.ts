// Library management (spec 05, 05.7, A7, A8): "Remove download" and "Delete book". Pure over its stores and the file
// helpers it is handed, so `node --test` runs the code the app runs; src/lib/library-manage.ts binds it to the device.
//
// - "Remove download" (A7): the book's audio files go; the book stays, marked not on device, with its position,
//   bookmarks, speed, moods, picks, verdicts, mix and cover. Its built playlist is released: a book that is not on the
//   device no longer holds its pieces, and builds its playlist again once its file is back.
// - "Delete book": everything kept for the book goes (src/lib/library-store.ts removeBook: every per-book key), with
//   its files, cover and download rows.
// - Either way (A8), each of its pieces is deleted unless another book still on the device has it in its playlist
//   (src/lib/playlist.ts unreferenced).
import type { LibraryStore } from "./library-store.ts";
import { unreferenced, type PlaylistPiece, type PlaylistRecord } from "./playlist.ts";
import type { PlaylistStore } from "./playlist-store.ts";
import type { Download } from "./types.ts";

/** A book's pieces that may go when it leaves (A8): those no other book still on the device has in its playlist. */
export function piecesFreedBy(bookId: string, records: readonly PlaylistRecord[], onDevice: (bookId: string) => boolean): PlaylistPiece[] {
  const own = records.find((r) => r.bookId === bookId);
  if (!own) return [];
  return unreferenced(
    own.pieces,
    records.filter((r) => r.bookId !== bookId && onDevice(r.bookId)),
  );
}

export type RemovalDeps = {
  library: Pick<LibraryStore, "getBook" | "removeBook" | "setOnDevice">;
  playlists: Pick<PlaylistStore, "list" | "remove">;
  downloads: { list(): Download[]; remove(id: string): void };
  files: {
    /** Deletes these stored audio files (a book's `BookFile.ref`s), leaving its cover. */
    deleteAudio(refs: string[]): Promise<void>;
    /** Deletes everything stored for the book: its audio and its cover. */
    deleteBook(bookId: string): Promise<void>;
    deletePiece(key: string): Promise<void>;
  };
  /** Forgets a LibriVox download still waiting to run for the book (src/lib/librivox-download.ts). */
  forgetPending?(bookId: string): void;
};

export function createBookRemoval(deps: RemovalDeps) {
  const { library, playlists, downloads, files } = deps;
  const onDevice = (id: string) => library.getBook(id)?.onDevice === true;

  /** Releases the book's playlist (A8) and drops its own download rows. */
  async function release(bookId: string): Promise<void> {
    const freed = piecesFreedBy(bookId, playlists.list(), onDevice);
    playlists.remove(bookId);
    for (const d of downloads.list()) {
      const mine = d.target.kind === "book" ? d.target.bookId === bookId : freed.some((p) => d.target.kind === "piece" && p.id === d.target.pieceId);
      if (mine) downloads.remove(d.id);
    }
    deps.forgetPending?.(bookId);
    await Promise.all(freed.map((p) => files.deletePiece(p.key).catch(() => {})));
  }

  return {
    /** "Remove download" (A7). False when the book is unknown or already not on the device. */
    async removeDownload(bookId: string): Promise<boolean> {
      const book = library.getBook(bookId);
      if (!book || !book.onDevice) return false;
      // Marked first, so the player lets go of it before its files go.
      library.setOnDevice(bookId, false);
      await release(bookId);
      await files.deleteAudio(book.files.map((f) => f.ref)).catch(() => {});
      return true;
    },
    /** "Delete book": the book and all it kept. False when it is unknown. */
    async deleteBook(bookId: string): Promise<boolean> {
      if (!library.getBook(bookId)) return false;
      // The book leaves the shelf first, so it no longer counts as holding its pieces.
      library.removeBook(bookId);
      await release(bookId);
      await files.deleteBook(bookId).catch(() => {});
      return true;
    },
  };
}

export type BookRemoval = ReturnType<typeof createBookRemoval>;
