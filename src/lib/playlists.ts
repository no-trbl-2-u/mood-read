// A book's playlist on this device, for the screens (spec 05, 05.4, A4, A5): "Build playlist" queues every piece the
// book plays on the one download queue (src/lib/downloads.ts: Wi-Fi-only, pause, resume, retry with backoff), keeps a
// record that the book built one (src/lib/playlist-store.ts), and from then on follows the book's picks: a changed
// pick queues the new piece and releases the old (A5). A released piece's file is deleted only when no other book's
// playlist on the device still has it (src/lib/playlist.ts unreferenced, A8's rule, which 05.7 reuses).
// The web build keeps one book's playlist (spec 05 Design, "The web build streams; phones keep"): building another
// book's releases the first. Storage is reached only through src/lib/ (agents.md rule 7).
import { useMemo, useSyncExternalStore } from "react";
import { Platform } from "react-native";

import type { CatalogPiece } from "./catalog";
import { loadCatalog, useCatalog } from "./catalog-config";
import { downloadQueue, downloadStore, useDownloads } from "./downloads";
import { getItem, removeItem, setItem } from "./kv";
import { library } from "./library";
import { deletePieceFile } from "./media";
import {
  booksToRelease,
  diffPlaylist,
  planBuild,
  playlistPieces,
  playlistStatus,
  recordOf,
  unreferenced,
  type PlaylistPiece,
  type PlaylistStatus,
} from "./playlist";
import { createPlaylistStore } from "./playlist-store";
import { scoringStore } from "./scoring";
import type { Book } from "./types";

export const playlistStore = createPlaylistStore({ getItem, setItem, removeItem });

/** How many books keep a playlist on this device: one in a browser, every book on a phone. */
export const MAX_PLAYLIST_BOOKS = Platform.OS === "web" ? 1 : Infinity;

const catalogMap = (pieces: readonly CatalogPiece[]) => new Map(pieces.map((p) => [p.id, p]));

function neededFor(book: Pick<Book, "id" | "chapters">, catalog: ReadonlyMap<string, CatalogPiece>): CatalogPiece[] {
  return playlistPieces(book.chapters, scoringStore.chapters(book.id), catalog);
}

function queueAll(pieces: readonly CatalogPiece[]): void {
  const plan = planBuild(pieces, downloadStore.list());
  for (const id of plan.queue) downloadQueue.enqueue({ kind: "piece", pieceId: id });
  for (const id of plan.retry) downloadQueue.retry(id);
  for (const id of plan.resume) downloadQueue.resume(id);
}

/** Releases pieces a book no longer holds: each one no built playlist still has leaves the queue and the device. */
function release(pieces: readonly PlaylistPiece[]): void {
  for (const piece of unreferenced(pieces, playlistStore.list())) {
    for (const d of downloadStore.list()) if (d.target.kind === "piece" && d.target.pieceId === piece.id) downloadQueue.remove(d.id);
    void deletePieceFile(piece.key).catch(() => {});
  }
}

/** Forgets that a book built its playlist, releasing its pieces (the web build's one-book rule; 05.7's removal). */
export function releaseBook(bookId: string): void {
  const record = playlistStore.get(bookId);
  if (!record) return;
  playlistStore.remove(bookId);
  release(record.pieces);
}

/**
 * "Build playlist" (A4): every piece the book plays, queued for download, retried or resumed; a piece already on the
 * device is shared, never fetched again. False when the book has no piece to build (nothing scored, the catalog has
 * none of its pieces, or it could not be read).
 */
export async function buildPlaylist(book: Pick<Book, "id" | "chapters">): Promise<boolean> {
  let catalog: ReadonlyMap<string, CatalogPiece>;
  try {
    catalog = catalogMap((await loadCatalog()).catalog.pieces);
  } catch {
    return false;
  }
  const needed = neededFor(book, catalog);
  if (needed.length === 0) return false;
  const before = playlistStore.get(book.id);
  // The new record first, so a piece this book shares with a released one stays on the device.
  playlistStore.put(recordOf(book.id, needed, Date.now()));
  for (const other of booksToRelease(book.id, playlistStore.list(), MAX_PLAYLIST_BOOKS)) releaseBook(other);
  if (before) release(diffPlaylist(before, needed).drop);
  queueAll(needed);
  return true;
}

/**
 * Follows every built playlist after a pick changes (A5), or the scores do (a rescore, 05.3's re-match): the new pieces
 * are queued and the ones no longer played released. A book no longer on the device is left to 05.7.
 */
async function follow(): Promise<void> {
  if (playlistStore.list().length === 0) return;
  let catalog: ReadonlyMap<string, CatalogPiece>;
  try {
    catalog = catalogMap((await loadCatalog()).catalog.pieces);
  } catch {
    return;
  }
  for (const record of playlistStore.list()) {
    const book = library.getBook(record.bookId);
    if (!book) continue;
    const needed = neededFor(book, catalog);
    const { add, drop } = diffPlaylist(record, needed);
    if (add.length === 0 && drop.length === 0) continue;
    playlistStore.put(recordOf(book.id, needed, record.builtAt));
    queueAll(add);
    release(drop);
  }
}

scoringStore.subscribe(() => void follow());

/** Whether this book built its playlist on this device. */
export function usePlaylistBuilt(bookId: string): boolean {
  const read = () => playlistStore.get(bookId) !== null;
  return useSyncExternalStore(playlistStore.subscribe, read, read);
}

/**
 * The book's playlist as the screen shows it: null while the catalog is unread or the book has no piece to build
 * (an unscored book, A4: no button), else its status over the book's piece downloads.
 */
export function usePlaylist(book: Pick<Book, "id" | "chapters">): PlaylistStatus | null {
  const catalog = useCatalog();
  const downloads = useDownloads();
  const built = usePlaylistBuilt(book.id);
  const chapters = useSyncExternalStore(
    scoringStore.subscribe,
    () => scoringStore.chapters(book.id),
    () => scoringStore.chapters(book.id),
  );
  const needed = useMemo(
    () => (catalog.status === "ready" ? playlistPieces(book.chapters, chapters, catalogMap(catalog.pieces)) : []),
    [catalog, book.chapters, chapters],
  );
  if (needed.length === 0) return null;
  return playlistStatus(needed, downloads, built);
}
