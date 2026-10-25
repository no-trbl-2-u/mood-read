// The music catalog inside the Worker (05.3, spec 05 A3; D8): the snapshot of the live manifest (catalog/catalog.json,
// refreshed after every `catalog:add`; the bucket stays the source of truth) is bundled into the Worker, so naming a
// chapter's pieces is hermetic and costs no call. Only entries that pass the app's own validator are named
// (src/lib/catalog.ts readCatalog: A1, vocals none), and the pieces come from the matcher the app shares
// (src/lib/catalog-match.ts), never from the model. The model's famous piece is the reference only (D13).
// A redeploy picks up a refreshed snapshot; until then a newer catalog piece is simply not named yet.
import snapshot from "../../catalog/catalog.json" with { type: "json" };
import { readCatalog, type CatalogPiece } from "../../src/lib/catalog.ts";
import { asPiece, matchChapter, type MatchMood } from "../../src/lib/catalog-match.ts";
import type { ChapterPieces, ChapterResult, JobView } from "./contract.ts";

/** The catalog pieces the proxy may name: the bundled snapshot's valid entries. */
export const CATALOG: readonly CatalogPiece[] = readCatalog(snapshot).catalog.pieces;

/** A chapter's catalog pieces from its emotions and scenes, as the contract names them; null when none fits. */
export function catalogPieces(mood: MatchMood, catalog: readonly CatalogPiece[] = CATALOG): ChapterPieces | null {
  const m = matchChapter(mood, catalog);
  if (!m) return null;
  return {
    piece: asPiece(m.piece),
    alternates: m.alternates.map(asPiece),
    ...(mood.scenes && mood.scenes.length ? { scenePieces: m.scenePieces.map(asPiece) } : {}),
  };
}

/**
 * A cached result scored before v2 (its pieces named freely by the model) read against the catalog when it is served:
 * a scored chapter whose pieces are not all catalog pieces is re-matched from its stored emotions, its old named piece
 * kept as the reference, with no new research run (A3). A chapter already on the catalog is left as it is.
 */
export function catalogChapter(c: ChapterResult, catalog: readonly CatalogPiece[] = CATALOG): ChapterResult {
  if (c.mood.coverage !== "scored") return c;
  const ids = new Set(catalog.map((p) => p.id));
  const p = c.pieces;
  if (p && [p.piece, ...p.alternates, ...(p.scenePieces ?? [])].every((x) => ids.has(x.id))) return c;
  if (catalog.length === 0) return c;
  const reference = p?.reference ?? (p && !ids.has(p.piece.id) ? p.piece : undefined);
  const next = catalogPieces(c.mood, catalog);
  return { ...c, pieces: next && (reference ? { ...next, reference } : next) };
}

/** A job view with every chapter of its result on the catalog (catalogChapter); everything else as it was. */
export function catalogJobView(view: JobView, catalog: readonly CatalogPiece[] = CATALOG): JobView {
  if (!view.result) return view;
  return { ...view, result: { ...view.result, chapters: view.result.chapters.map((c) => catalogChapter(c, catalog)) } };
}
