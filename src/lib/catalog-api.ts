// The app's read of the music catalog (spec 05, 05.1): catalog.json from one configured public base URL, checked
// with the same validator `pnpm catalog:add` uses (./catalog.ts). An entry that fails A1 is left out, so it is never
// played or named. Pure: `fetch` is handed in, so tests run it against a fake host. No key: the bucket is public and
// read-only to the app (A22).
import { CATALOG_FILE, readCatalog, type Catalog, type CatalogPiece, type Ignored } from "./catalog.ts";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** The placeholder base URL resolves nowhere (.invalid) until the owner sets the bucket's public address. */
export const CATALOG_PLACEHOLDER = "https://mood-read-catalog.invalid";

/** True once the base URL is a real https address, not the placeholder. */
export function catalogConfigured(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return u.protocol === "https:" && !u.hostname.endsWith(".invalid");
  } catch {
    return false;
  }
}

const trim = (baseUrl: string) => baseUrl.replace(/\/+$/, "");

/** Where a piece's audio is served: its content-addressed key under the base URL. */
export function pieceAudioUrl(baseUrl: string, piece: Pick<CatalogPiece, "file">): string {
  return `${trim(baseUrl)}/${piece.file.key}`;
}

export type CatalogRead = { catalog: Catalog; ignored: Ignored[] };

/** Fetches and checks catalog.json. Throws when the host can't be reached or the file as a whole is not a catalog. */
export async function fetchCatalog(baseUrl: string, fetchImpl: Fetch): Promise<CatalogRead> {
  if (!catalogConfigured(baseUrl)) throw new Error("the music catalog's address is not set yet");
  const res = await fetchImpl(`${trim(baseUrl)}/${CATALOG_FILE}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`the music catalog answered ${res.status}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("the music catalog is not JSON");
  }
  return readCatalog(body);
}
