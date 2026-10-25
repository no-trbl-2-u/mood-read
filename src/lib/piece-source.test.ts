import assert from "node:assert/strict";
import { test } from "node:test";

import { CATALOG_PLACEHOLDER } from "./catalog-api.ts";
import { validPiece, validVerdict } from "./catalog-fixtures.ts";
import type { CatalogPiece } from "./catalog.ts";
import { loopSecondsOf, mayPlay, pieceSource, PLAYABLE_LICENSES } from "./piece-source.ts";

const BASE = "https://pub-test.r2.dev";
const piece = validPiece();
const catalogOf = (...pieces: CatalogPiece[]) => new Map(pieces.map((p) => [p.id, p]));

test("A18: only cc0, public domain, CC BY and CC BY-SA may play", () => {
  assert.deepEqual([...PLAYABLE_LICENSES].sort(), ["cc-by", "cc-by-sa", "cc0", "public-domain"]);
  for (const id of PLAYABLE_LICENSES) {
    assert.equal(mayPlay(validPiece({ license: { id, version: null, url: null } })), true, id);
  }
  for (const id of ["cc-by-nc", "cc-by-nd", "cc-by-nc-sa", "all-rights-reserved", "", undefined]) {
    assert.equal(mayPlay(validPiece({ license: { id: id as never, version: "4.0", url: null } })), false, String(id));
  }
});

test("A18: vocals, a verdict other than allowed, or no file never play", () => {
  assert.equal(mayPlay(piece), true);
  assert.equal(mayPlay({ ...piece, vocals: "some" }), false);
  assert.equal(mayPlay({ ...piece, verdict: validVerdict({ verdict: "unclear" as never }) }), false, "unclear is no");
  assert.equal(mayPlay({ ...piece, verdict: validVerdict({ vocals: "some" as never }) }), false);
  assert.equal(mayPlay({ ...piece, verdict: undefined }), false);
  assert.equal(mayPlay({ ...piece, license: undefined }), false);
  assert.equal(mayPlay({ ...piece, file: undefined }), false);
  assert.equal(mayPlay(null), false);
  assert.equal(mayPlay("night-vigil"), false);
});

test("A17: a catalog piece streams from the catalog's bucket, at its content-addressed key", () => {
  const src = pieceSource("night-vigil", catalogOf(piece), { baseUrl: `${BASE}/` });
  assert.deepEqual(src, { pieceId: "night-vigil", uri: `${BASE}/${piece.file.key}`, local: false, loopSeconds: 120 });
});

test("A17: a piece already on the device plays from its file", () => {
  const seen: string[] = [];
  const src = pieceSource("night-vigil", catalogOf(piece), {
    baseUrl: BASE,
    local: (p) => {
      seen.push(p.id);
      return "file:///pieces/x.m4a";
    },
  });
  assert.deepEqual(src, { pieceId: "night-vigil", uri: "file:///pieces/x.m4a", local: true, loopSeconds: 120 });
  assert.deepEqual(seen, ["night-vigil"]);
  // On the device even with the catalog's address unset.
  assert.equal(pieceSource("night-vigil", catalogOf(piece), { baseUrl: CATALOG_PLACEHOLDER, local: () => "file:///p.m4a" })?.local, true);
});

test("A18: no id, a piece not in the catalog, an unlicensed one or one whose audio failed has no source", () => {
  const cat = catalogOf(piece);
  assert.equal(pieceSource(null, cat, { baseUrl: BASE }), null);
  assert.equal(pieceSource("composer-1--theme-1", cat, { baseUrl: BASE }), null, "a named piece from before v2");
  const nc = validPiece({ id: "nc", license: { id: "cc-by-nc" as never, version: "4.0", url: null } });
  assert.equal(pieceSource("nc", catalogOf(nc), { baseUrl: BASE, local: () => "file:///nc.m4a" }), null, "not even from the device");
  assert.equal(pieceSource("night-vigil", cat, { baseUrl: BASE, unreachable: new Set(["night-vigil"]) }), null);
  assert.equal(pieceSource("night-vigil", cat, { baseUrl: CATALOG_PLACEHOLDER }), null, "no address, nothing on the device");
  // A map entry under another id never stands in for the asked one.
  assert.equal(pieceSource("other", new Map([["other", piece]]), { baseUrl: BASE }), null);
});

test("A17: a piece loops whole, by its loop's end, else its duration", () => {
  assert.equal(loopSecondsOf({ loop: { start: 0, end: 206.5 }, duration: 207 }), 206.5);
  assert.equal(loopSecondsOf({ loop: { start: 0, end: 0 }, duration: 90 }), 90);
  assert.equal(loopSecondsOf({ loop: undefined as never, duration: Number.NaN }), 0);
});
