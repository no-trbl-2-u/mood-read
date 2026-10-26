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
import type { Book, Download } from "./types.ts";

/** A book's pieces that may go when it leaves (A8): those no other book still on the device has in its playlist. */
export function piecesFreedBy(bookId: string, records: readonly PlaylistRecord[], onDevice: (bookId: string) => boolean): PlaylistPiece[] {
  const own = records.find((r) => r.bookId === bookId);
  if (!own) return [];
  return unreferenced(
    own.pieces,
    records.filter((r) => r.bookId !== bookId && onDevice(r.bookId)),
  );
}

/**
 * The books that leave the device when `justKept` landed on it, so at most `max` stay (the web build: 1, spec 05
 * Design, "The web build streams; phones keep"). The books that just landed stay; room beyond them goes to the
 * other books most recently played (else most recently added). Nothing leaves when nothing landed.
 */
export function booksToEvict(books: readonly Book[], justKept: readonly string[], max: number): string[] {
  if (justKept.length === 0) return [];
  const kept = new Set(justKept);
  const others = books
    .filter((b) => b.onDevice && !kept.has(b.id))
    .sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));
  const room = Math.max(0, max - justKept.length);
  return others.slice(room).map((b) => b.id);
}

/**
 * The books on the device now that `seen` did not know, which is how a landing is noticed without every path that
 * adds a book (import, LibriVox download, "Find the file") having to say so. Brings `seen` up to date.
 */
export function newlyOnDevice(seen: Set<string>, books: readonly Book[]): string[] {
  const now = books.filter((b) => b.onDevice).map((b) => b.id);
  const fresh = now.filter((id) => !seen.has(id));
  seen.clear();
  for (const id of now) seen.add(id);
  return fresh;
}

export type RemovalDeps = {
  library: Pick<LibraryStore, "books" | "getBook" | "removeBook" | "setOnDevice">;
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
    /**
     * Keeps at most `max` books on the device once `justKept` landed: the others go through "Remove download", so
     * each stays on the shelf with its position, bookmarks, moods, picks and mix. Returns the ids removed.
     */
    async enforceLimit(justKept: readonly string[], max: number): Promise<string[]> {
      const out: string[] = [];
      for (const id of booksToEvict(library.books(), justKept, max)) if (await this.removeDownload(id)) out.push(id);
      return out;
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
