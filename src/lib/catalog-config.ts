// The music catalog's one public base URL (`expo.extra.catalogBaseUrl` in app.json: a public, read-only address, not
// a secret), bound for the screens. The placeholder resolves nowhere until the owner sets the bucket's address.
import Constants from "expo-constants";

import { CATALOG_PLACEHOLDER, fetchCatalog, type CatalogRead } from "./catalog-api";

export const CATALOG_BASE_URL: string = (Constants.expoConfig?.extra?.catalogBaseUrl as string | undefined) ?? CATALOG_PLACEHOLDER;

/** The catalog as this device may use it: only entries that pass A1. */
export function loadCatalog(): Promise<CatalogRead> {
  return fetchCatalog(CATALOG_BASE_URL, (input, init) => fetch(input, init));
}
