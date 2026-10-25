// The music catalog's one public base URL (`expo.extra.catalogBaseUrl` in app.json: a public, read-only address, not
// a secret), bound for the screens. The placeholder resolves nowhere until the owner sets the bucket's address.
import Constants from "expo-constants";
import { useEffect, useState } from "react";

import { CATALOG_PLACEHOLDER, catalogConfigured, fetchCatalog, type CatalogRead } from "./catalog-api";
import type { CatalogPiece } from "./catalog";

export const CATALOG_BASE_URL: string = (Constants.expoConfig?.extra?.catalogBaseUrl as string | undefined) ?? CATALOG_PLACEHOLDER;

// One read per session, shared by the screens and the player's music layer (01.10); a failed read is tried afresh.
let shared: Promise<CatalogRead> | null = null;

/** The catalog as this device may use it: only entries that pass A1. */
export function loadCatalog(): Promise<CatalogRead> {
  shared ??= fetchCatalog(CATALOG_BASE_URL, (input, init) => fetch(input, init)).catch((e: unknown) => {
    shared = null;
    throw e;
  });
  return shared;
}

/** The catalog for a screen: `unset` while the address is the placeholder (nothing is fetched), else its read. */
export type CatalogState =
  | { status: "unset" }
  | { status: "loading" }
  | { status: "ready"; pieces: CatalogPiece[] }
  | { status: "failed" };

export function useCatalog(): CatalogState {
  const configured = catalogConfigured(CATALOG_BASE_URL);
  const [state, setState] = useState<CatalogState>(configured ? { status: "loading" } : { status: "unset" });
  useEffect(() => {
    if (!configured) return;
    let live = true;
    loadCatalog().then(
      (read) => live && setState({ status: "ready", pieces: read.catalog.pieces }),
      () => live && setState({ status: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [configured]);
  return state;
}
