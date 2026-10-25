// The hermetic guard every e2e page runs under: no console error, no page error, no failed request, and no origin
// but localhost (blob: and data: URLs are the page's own). A spec asserts the collected list is empty.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

// The music catalog's real address (05.19) answers here with an empty catalog, so no page reaches R2; a spec that
// needs pieces routes catalog.json itself (a page route outranks this one).
const APP_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app.json");
const CATALOG_BASE: string = JSON.parse(fs.readFileSync(APP_JSON, "utf8")).expo.extra.catalogBaseUrl;
const EMPTY_CATALOG = { schema: 1, version: 0, updatedAt: "2026-10-25T00:00:00.000Z", pieces: [] };

/** The committed snapshot of the live catalog (catalog/catalog.json, 05.2), for a spec that needs real pieces. */
export const CATALOG_SNAPSHOT: { pieces: { id: string; title: string; artist: string; license: { id: string; version: string | null } }[] } = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "catalog", "catalog.json"), "utf8"),
);

/**
 * Answers every piece's audio at the catalog's address with `body` on this page (01.10), keeping each request's key,
 * so the music layer streams on the page without reaching R2.
 */
export async function servePieces(page: Page, body: Buffer): Promise<string[]> {
  const keys: string[] = [];
  await page.route(`${CATALOG_BASE}/pieces/**`, (route) => {
    keys.push(new URL(route.request().url()).pathname.slice(1));
    return route.fulfill({ status: 200, body, headers: { "content-type": "audio/wav" } });
  });
  return keys;
}

/** Answers the catalog's address with the committed snapshot on this page (a page route outranks the guard's). */
export async function serveCatalog(page: Page): Promise<void> {
  await page.route(`${CATALOG_BASE}/catalog.json`, (route) => route.fulfill({ status: 200, json: CATALOG_SNAPSHOT }));
}

const isLocal = (url: string) => {
  const { protocol, hostname } = new URL(url);
  if (protocol === "data:" || protocol === "blob:") return true;
  return hostname === "127.0.0.1" || hostname === "localhost";
};

// Collects every problem on the page; the walk asserts the list is empty.
export async function guard(page: Page): Promise<string[]> {
  const problems: string[] = [];
  await page.context().route("**/*", (route) => {
    const url = route.request().url();
    if (isLocal(url)) return route.continue();
    if (url === `${CATALOG_BASE}/catalog.json`) return route.fulfill({ status: 200, json: EMPTY_CATALOG });
    problems.push(`blocked non-localhost request: ${url}`);
    return route.abort("blockedbyclient");
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`page error: ${err.message}`));
  page.on("requestfailed", (req) => {
    const error = req.failure()?.errorText;
    // A media element cancels its own load of an on-device blob once it has what it asked for (the duration
    // probe stops after metadata, a replaced file stops loading): not a failure.
    const mediaStop = req.resourceType() === "media" && req.url().startsWith("blob:") && error === "net::ERR_ABORTED";
    if (isLocal(req.url()) && !mediaStop) problems.push(`failed request: ${req.url()} (${error})`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  return problems;
}
