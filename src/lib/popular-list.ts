// Browse's default list (05.20, A22; design/layouts/DECISION.md "Browse": "before any search, Browse lists 'Popular on
// LibriVox' (the pre-scored books first)"). Three reads, at most four calls, once per visit to Browse:
//
//   1. the proxy's listing of pre-scored books (LibriVox numbers and overall emotions; src/lib/overall-api.ts), and
//      archive.org's most-downloaded LibriVox books (src/lib/librivox-api.ts popular()), side by side;
//   2. then, side by side again: archive.org's titles for the pre-scored numbers the popular page lacks
//      (byCatalogIds()), and the proxy's overall emotions for the popular page's other numbers (fetchOverall()), so a
//      popular book that is pre-scored but older than the listing's newest still counts as pre-scored.
//
// The list: the pre-scored books first (the listing's order, then any other pre-scored popular book in popular
// order), then the rest of the popular page in download order, each book once (by archive.org identifier and by
// LibriVox number). A failed listing means the proxy is down: the popular page alone, with no scores and no second
// proxy call. archive.org failing on both calls (or answering nothing) leaves no list: Browse shows its plain prompt.
// Pure: `fetch` is handed in, so tests run it against fakes.
import { byCatalogIds, popular, type LibriVoxSearchResult } from "./librivox-api.ts";
import { fetchOverall, fetchPrescored, type Overall, type PrescoredBook } from "./overall-api.ts";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** How many of archive.org's most-downloaded LibriVox books the default list shows (a search's page is 20 too). */
export const POPULAR_ROWS = 20;

export type PopularList = {
  rows: LibriVoxSearchResult[];
  /** The pre-scored rows' overall emotions, by LibriVox number. */
  overall: Overall;
};

/**
 * Orders the default list: pre-scored books first (the listing's order, then `extra`'s pre-scored popular books in
 * popular order), then the rest of `popularRows`; each book once. `lookedUp` supplies titles for listed numbers the
 * popular page lacks; a listed number found nowhere is left out.
 */
export function mergePopular(
  listing: PrescoredBook[],
  lookedUp: LibriVoxSearchResult[],
  popularRows: LibriVoxSearchResult[],
  extra: Overall = {},
): PopularList {
  const overall: Overall = {};
  const byCatalog = new Map<string, LibriVoxSearchResult>();
  // The popular page's copy of a book wins over a lookup's: it is the edition most listened to.
  for (const r of [...popularRows, ...lookedUp]) if (r.catalogId && !byCatalog.has(r.catalogId)) byCatalog.set(r.catalogId, r);

  const rows: LibriVoxSearchResult[] = [];
  const seenIds = new Set<string>();
  const seenCatalog = new Set<string>();
  const add = (r: LibriVoxSearchResult) => {
    if (seenIds.has(r.identifier) || (r.catalogId && seenCatalog.has(r.catalogId))) return false;
    seenIds.add(r.identifier);
    if (r.catalogId) seenCatalog.add(r.catalogId);
    rows.push(r);
    return true;
  };

  for (const book of listing) {
    const r = byCatalog.get(book.id);
    if (r && add(r)) overall[book.id] = book.emotions;
  }
  for (const r of popularRows) {
    const emotions = r.catalogId ? extra[r.catalogId] : undefined;
    if (emotions?.length && add(r)) overall[r.catalogId!] = emotions;
  }
  for (const r of popularRows) add(r);
  return { rows, overall };
}

/** Loads the default list; throws archive.org's error when it has nothing to show (Browse then shows its prompt). */
export async function loadPopular(proxyUrl: string, fetchImpl: Fetch, rows = POPULAR_ROWS): Promise<PopularList> {
  const [listing, popularRes] = await Promise.all([
    fetchPrescored(proxyUrl, fetchImpl),
    popular(fetchImpl, rows).then(
      (found) => ({ ok: true as const, found }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  ]);
  const popularRows = popularRes.ok ? popularRes.found : [];
  const onPopular = new Set(popularRows.map((r) => r.catalogId).filter((id): id is string => !!id));
  const listed = new Set((listing ?? []).map((b) => b.id));
  const missing = (listing ?? []).map((b) => b.id).filter((id) => !onPopular.has(id));
  const others = [...onPopular].filter((id) => !listed.has(id));

  const [lookedUp, extra] = await Promise.all([
    missing.length ? byCatalogIds(fetchImpl, missing).catch(() => [] as LibriVoxSearchResult[]) : Promise.resolve([] as LibriVoxSearchResult[]),
    // A failed listing means the proxy is down: no second proxy call, and no scores.
    listing && others.length ? fetchOverall(proxyUrl, fetchImpl, others) : Promise.resolve({} as Overall),
  ]);
  const list = mergePopular(listing ?? [], lookedUp, popularRows, extra);
  if (!list.rows.length && !popularRes.ok) throw popularRes.error;
  return list;
}
