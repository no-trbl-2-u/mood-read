// A book's playlist on the device (spec 05, 05.4, A4, A5): "Build playlist" downloads every piece a scored book
// plays, so it plays offline from any chapter. Pure decisions only, so `node --test` runs them; src/lib/playlists.ts
// binds them to the download queue, the scores and the catalog.
//
// - What a book needs (playlistPieces): for each chapter still under the title it was scored with, the piece each of
//   its scenes plays (src/lib/scenes.ts scenePiecesOf: the listener's pick covers every scene, D18; else the scene
//   pieces; else the chapter's piece, auto), once each, and only a piece the player may play (mayPlay, A18). An
//   unscored chapter needs nothing: it plays narration over the book's soundscape, as in v1.
// - What a press does (planBuild): queue each needed piece that has no download yet, retry a failed one, resume a
//   paused one; a piece already done (another book's, or this one's before) is left as it is: shared, never copied.
// - A changed pick (diffPlaylist, A5): the new piece is added, the old one released.
// - Releasing (unreferenced, A8): a piece's file is deleted only when no book's built playlist on the device still
//   has it. 05.7's "Remove download" and "Delete book" reuse this rule.
// - The web build keeps one book's playlist (booksToRelease): building another releases the rest.
import type { CatalogPiece } from "./catalog.ts";
import { mayPlay } from "./piece-source.ts";
import { scenePiecesOf, scenesOf } from "./scenes.ts";
import type { Chapter, ChapterScore, Download } from "./types.ts";

/** A piece in a built playlist: its catalog id and the key its file is named by (media.ts pieceFile). */
export type PlaylistPiece = { id: string; key: string };

/** A book whose playlist was built on this device, and the pieces it holds there. */
export type PlaylistRecord = { bookId: string; pieces: PlaylistPiece[]; builtAt: number };

export function recordOf(bookId: string, pieces: readonly Pick<CatalogPiece, "id" | "file">[], builtAt: number): PlaylistRecord {
  return { bookId, pieces: pieces.map((x) => ({ id: x.id, key: x.file.key })), builtAt };
}

/** Every piece the book plays, once each in chapter order, that the catalog has and allows to play. */
export function playlistPieces(
  chapters: readonly Pick<Chapter, "index" | "title">[],
  scores: readonly ChapterScore[],
  catalog: ReadonlyMap<string, CatalogPiece>,
): CatalogPiece[] {
  const out: CatalogPiece[] = [];
  const seen = new Set<string>();
  for (const c of chapters) {
    const s = scores.find((x) => x.mood.chapterIndex === c.index && x.mood.chapterTitle === c.title);
    if (!s) continue;
    for (const id of scenePiecesOf(s.playlist, scenesOf(s.mood).length)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const piece = catalog.get(id);
      if (piece && piece.id === id && mayPlay(piece)) out.push(piece);
    }
  }
  return out;
}

/** The piece's newest download row, if any. */
function downloadOf(downloads: readonly Download[], pieceId: string): Download | undefined {
  let found: Download | undefined;
  for (const d of downloads) if (d.target.kind === "piece" && d.target.pieceId === pieceId && (!found || d.queuedAt >= found.queuedAt)) found = d;
  return found;
}

/** What one "Build playlist" press does to the queue. */
export function planBuild(needed: readonly Pick<CatalogPiece, "id">[], downloads: readonly Download[]): { queue: string[]; retry: string[]; resume: string[] } {
  const plan = { queue: [] as string[], retry: [] as string[], resume: [] as string[] };
  for (const piece of needed) {
    const d = downloadOf(downloads, piece.id);
    if (!d) plan.queue.push(piece.id);
    else if (d.state === "failed") plan.retry.push(d.id);
    else if (d.state === "paused") plan.resume.push(d.id);
  }
  return plan;
}

export type PlaylistState = "unbuilt" | "building" | "paused" | "failed" | "done";

/** The playlist's progress: pieces on the device of all it needs, and bytes over the catalog's file sizes. */
export type PlaylistStatus = { state: PlaylistState; done: number; total: number; bytes: number; totalBytes: number; failed: number; paused: number };

export function playlistStatus(needed: readonly Pick<CatalogPiece, "id" | "file">[], downloads: readonly Download[], built: boolean): PlaylistStatus {
  let done = 0;
  let bytes = 0;
  let totalBytes = 0;
  let failed = 0;
  let paused = 0;
  let moving = 0;
  for (const piece of needed) {
    const size = piece.file.bytes;
    totalBytes += size;
    const d = downloadOf(downloads, piece.id);
    if (d?.state === "done") {
      done++;
      bytes += size;
      continue;
    }
    bytes += Math.min(size, Math.max(0, d?.bytes ?? 0));
    if (d?.state === "failed") failed++;
    else if (d?.state === "paused") paused++;
    else if (d) moving++;
  }
  const total = needed.length;
  const state: PlaylistState =
    !built || total === 0 ? "unbuilt" : done === total ? "done" : moving > 0 ? "building" : failed > 0 ? "failed" : paused > 0 ? "paused" : "building";
  return { state, done, total, bytes, totalBytes, failed, paused };
}

/** A pick changed (A5), or the scores did: the pieces the book now needs that its record lacks, and those it no longer needs. */
export function diffPlaylist(record: PlaylistRecord | null, needed: readonly Pick<CatalogPiece, "id" | "file">[]): { add: CatalogPiece[]; drop: PlaylistPiece[] } {
  const had = new Set((record?.pieces ?? []).map((x) => x.id));
  const wants = new Set(needed.map((x) => x.id));
  return {
    add: needed.filter((x) => !had.has(x.id)) as CatalogPiece[],
    drop: (record?.pieces ?? []).filter((x) => !wants.has(x.id)),
  };
}

/**
 * The released pieces whose files may go (A8): those no built playlist in `records` (the device's, after the release)
 * still holds. Each once.
 */
export function unreferenced(released: readonly PlaylistPiece[], records: readonly PlaylistRecord[]): PlaylistPiece[] {
  const kept = new Set(records.flatMap((r) => r.pieces.map((x) => x.id)));
  const out: PlaylistPiece[] = [];
  for (const x of released) if (!kept.has(x.id) && !out.some((y) => y.id === x.id)) out.push(x);
  return out;
}

/**
 * The other books whose playlists go when `bookId`'s is built, so at most `maxBooks` stay (the web build: 1). The most
 * recently built stay first.
 */
export function booksToRelease(bookId: string, records: readonly PlaylistRecord[], maxBooks: number): string[] {
  const others = records.filter((r) => r.bookId !== bookId).sort((a, b) => b.builtAt - a.builtAt);
  const keep = Math.max(0, maxBooks - 1);
  return others.slice(keep).map((r) => r.bookId);
}
