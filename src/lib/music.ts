// The music layer's catalog on this device (01.10, spec 01 A17, A18): the catalog the player plays pieces from, read
// once (the screens share the same read, src/lib/catalog-config.ts) the first time a book's bed is on music, and
// where each piece plays from (src/lib/piece-source.ts pieceSource: a downloaded file first, else the stream). A
// piece whose audio failed to load is not tried again this session, so the bed falls back instead of retrying.
// Storage is reached only here, through src/lib (agents.md rule 7): the download store says whether 05.4 has the
// piece on the device, and media.ts where its file is.
import type { CatalogPiece } from "./catalog";
import { CATALOG_BASE_URL, loadCatalog } from "./catalog-config";
import { downloadStore } from "./downloads";
import { localPieceUri, warmPieces } from "./media";
import { pieceSource, type PieceSource } from "./piece-source";

/** After a failed catalog read, the next try waits this long (ms). */
const RETRY_MS = 60_000;

let pieces: ReadonlyMap<string, CatalogPiece> = new Map();
let state: "idle" | "loading" | "ready" = "idle";
let failedAt = 0;
const unreachable = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** A downloaded piece's file (05.4, 05.6): only once its download is done and the file is still there. */
function local(piece: CatalogPiece): string | null {
  const done = downloadStore
    .list()
    .some((d) => d.state === "done" && d.target.kind === "piece" && d.target.pieceId === piece.id);
  return done ? localPieceUri(piece.file.key) : null;
}

// The web build reads the pieces it kept (05.4) back once per session; finding any re-plans the bed onto them.
void warmPieces().then((found) => found && notify());
// A piece landing (or released) changes where it plays from: the bed re-plans, on that change only, not on progress.
const donePieces = () =>
  downloadStore
    .list()
    .filter((d) => d.state === "done" && d.target.kind === "piece")
    .map((d) => (d.target.kind === "piece" ? d.target.pieceId : ""))
    .sort()
    .join(" ");
let landed = donePieces();
downloadStore.subscribe(() => {
  const now = donePieces();
  if (now === landed) return;
  landed = now;
  notify();
});

export const music = {
  /** Reads the catalog if it is not read yet (once per session; a failed read is tried again after a minute). */
  want(): void {
    if (state !== "idle" || Date.now() - failedAt < RETRY_MS) return;
    state = "loading";
    loadCatalog().then(
      (read) => {
        pieces = new Map(read.catalog.pieces.map((p) => [p.id, p]));
        state = "ready";
        notify();
      },
      () => {
        state = "idle";
        failedAt = Date.now();
      },
    );
  },
  /** Where a piece plays from now, or null: the bed then falls back to the soundscape, else silence (A18). */
  source(pieceId: string | null): PieceSource | null {
    return pieceSource(pieceId, pieces, { baseUrl: CATALOG_BASE_URL, local, unreachable });
  },
  /** The piece's audio did not load: it falls back for the rest of the session. */
  failed(pieceId: string): void {
    if (unreachable.has(pieceId)) return;
    unreachable.add(pieceId);
    notify();
  },
  /** Called when the catalog arrives or a piece fails, so the bed re-plans. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
