// Where a chapter's piece plays from (01.10, spec 01 A17, A18). One small pure resolver: a catalog piece id to the
// audio the bed loops, or null when it may not or cannot play, so the bed falls back to the book's soundscape, else
// silence, and never to an unlicensed source. 05.4's pre-download plugs in through `local`: a file already on the
// device wins over the stream from the catalog's public bucket.
//
// A18: only a catalog piece whose license allows playing it in the app (cc0, public domain, CC BY, CC BY-SA), with
// vocals none and the rights-checker's `allowed` verdict, ever plays (mayPlay). The catalog's own read already leaves
// out any entry that fails its validator (src/lib/catalog.ts readCatalog); this is the player's last check, so a
// piece that slipped past it still never plays.
// Pure and type-strippable (node --test): `local` is handed in.
import { pieceAudioUrl, catalogConfigured } from "./catalog-api.ts";
import { LICENSE_IDS, type CatalogPiece, type LicenseId } from "./catalog.ts";

/** The licenses a piece may play under (A18): the catalog's own allowed set, nothing NC, ND or reserved. */
export const PLAYABLE_LICENSES: readonly LicenseId[] = LICENSE_IDS;

/** True only for a catalog piece with a playable license, vocals none and the rights-checker's allowed verdict. */
export function mayPlay(piece: unknown): piece is CatalogPiece {
  if (!piece || typeof piece !== "object") return false;
  const p = piece as Partial<CatalogPiece>;
  if (p.vocals !== "none") return false;
  if (!p.license || !(PLAYABLE_LICENSES as readonly string[]).includes(p.license.id)) return false;
  const v = p.verdict;
  if (!v || v.verdict !== "allowed" || v.vocals !== "none") return false;
  if (!p.file || typeof p.file.key !== "string" || !p.file.key) return false;
  return true;
}

/** The audio a piece plays from: a file on the device, or the stream from the catalog's bucket. */
export type PieceSource = { pieceId: string; uri: string; local: boolean; loopSeconds: number };

export type PieceSourceOptions = {
  /** The catalog's public base URL (expo.extra.catalogBaseUrl). */
  baseUrl: string;
  /** The piece's file on this device, when it is downloaded (05.4, 05.6), else null. */
  local?: (piece: CatalogPiece) => string | null;
  /** Pieces whose audio failed to load this session: they fall back instead of trying again. */
  unreachable?: ReadonlySet<string>;
};

/** A piece's loop length in seconds: its loop's end (the file loops whole from 0), else its duration. */
export function loopSecondsOf(piece: Pick<CatalogPiece, "loop" | "duration">): number {
  const end = piece.loop?.end;
  return Number.isFinite(end) && end > 0 ? end : Number.isFinite(piece.duration) && piece.duration > 0 ? piece.duration : 0;
}

/**
 * Where the piece plays from, or null: no id, not in the catalog, not allowed to play (mayPlay), its audio already
 * failed this session, or neither on the device nor reachable at a configured catalog address.
 */
export function pieceSource(
  pieceId: string | null,
  catalog: ReadonlyMap<string, CatalogPiece>,
  opts: PieceSourceOptions,
): PieceSource | null {
  if (!pieceId || opts.unreachable?.has(pieceId)) return null;
  const piece = catalog.get(pieceId);
  if (!piece || piece.id !== pieceId || !mayPlay(piece)) return null;
  const loopSeconds = loopSecondsOf(piece);
  const local = opts.local?.(piece) ?? null;
  if (local) return { pieceId, uri: local, local: true, loopSeconds };
  if (!catalogConfigured(opts.baseUrl)) return null;
  return { pieceId, uri: pieceAudioUrl(opts.baseUrl, piece), local: false, loopSeconds };
}
