// The app's read of catalog.json (05.1): one public base URL, the same validator as `catalog:add`, and every entry
// that fails A1 left out so it is never played or named.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { CATALOG_PLACEHOLDER, catalogConfigured, fetchCatalog, pieceAudioUrl } from "./catalog-api.ts";
import { catalogOf, validPiece, validVerdict } from "./catalog-fixtures.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = "https://catalog.example/";

function host(body: unknown, status = 200) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    return typeof body === "string" ? new Response(body, { status }) : Response.json(body, { status });
  };
  return { calls, fetchImpl };
}

test("fetches catalog.json at the base URL and keeps the entries that pass A1", async () => {
  const { calls, fetchImpl } = host(catalogOf([validPiece()], 3));
  const read = await fetchCatalog(BASE, fetchImpl);
  assert.deepEqual(calls, ["https://catalog.example/catalog.json"]);
  assert.equal(read.catalog.version, 3);
  assert.deepEqual(read.catalog.pieces, [validPiece()]);
  assert.deepEqual(read.ignored, []);
});

test("rejects invalid entries: vocals, an NC license, an unclear verdict, no credit, no mood tags", async () => {
  const bad = [
    validPiece({ id: "sung", vocals: "has-vocals" as never }),
    validPiece({ id: "nc", license: { id: "cc-by-nc", version: "4.0", url: "https://creativecommons.org/licenses/by-nc/4.0/" } as never }),
    validPiece({ id: "unclear", verdict: validVerdict({ verdict: "unclear" as never }) }),
    validPiece({ id: "uncredited", credit: null }),
    validPiece({ id: "moodless", moodTags: [] }),
  ];
  const { fetchImpl } = host(catalogOf([...bad, validPiece()]));
  const read = await fetchCatalog(BASE, fetchImpl);
  assert.deepEqual(read.catalog.pieces.map((p) => p.id), ["night-vigil"]);
  assert.deepEqual(read.ignored.map((i) => i.id), ["sung", "nc", "unclear", "uncredited", "moodless"]);
});

test("a host error, non-JSON, or a wrong schema is an error, not a half-read catalog", async () => {
  await assert.rejects(fetchCatalog(BASE, host({}, 404).fetchImpl), /answered 404/);
  await assert.rejects(fetchCatalog(BASE, host("<html>").fetchImpl), /not JSON/);
  await assert.rejects(fetchCatalog(BASE, host({ ...catalogOf([]), schema: 2 }).fetchImpl), /schema 2/);
});

test("the placeholder address is never fetched", async () => {
  const { calls, fetchImpl } = host(catalogOf([]));
  await assert.rejects(fetchCatalog(CATALOG_PLACEHOLDER, fetchImpl), /not set yet/);
  assert.deepEqual(calls, []);
  assert.equal(catalogConfigured(CATALOG_PLACEHOLDER), false);
  assert.equal(catalogConfigured("http://catalog.example"), false);
  assert.equal(catalogConfigured("nonsense"), false);
  assert.equal(catalogConfigured("https://pub-0123.r2.dev"), true);
});

test("a piece's audio is its content-addressed key under the base URL", () => {
  const p = validPiece();
  assert.equal(pieceAudioUrl(BASE, p), `https://catalog.example/${p.file.key}`);
});

test("app.json holds the catalog's one public base URL: the mood-read-catalog bucket's r2.dev address (05.19)", () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));
  const url = app.expo.extra.catalogBaseUrl;
  assert.match(url, /^https:\/\/[^/]+$/);
  assert.notEqual(url, CATALOG_PLACEHOLDER);
  assert.equal(url, "https://pub-4a8a6c86fad24ced839c7dc3d3f4dc66.r2.dev");
  assert.equal(catalogConfigured(url), true);
});
