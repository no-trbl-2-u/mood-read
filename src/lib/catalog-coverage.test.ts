// A2 (05.2): the catalog covers every emotion in the scorer's fixed set at low and high intensity, with at least three
// pieces each. The fixtures walk the counting; the standing test reads the committed snapshot (catalog/catalog.json,
// refreshed after every `catalog:add`) and the sources it was built from (catalog/pieces, catalog/verdicts).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkCatalog, readCatalog, type CatalogPiece } from "./catalog.ts";
import { MIN_PIECES_PER_CELL, catalogCoverage, formatCoverage } from "./catalog-coverage.ts";
import { catalogOf, validPiece } from "./catalog-fixtures.ts";
import { EMOTIONS } from "./types.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CATALOG_DIR = path.join(ROOT, "catalog");
const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, "utf8"));
const idsIn = (dir: string) =>
  fs
    .readdirSync(path.join(CATALOG_DIR, dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();

test("the floor is three pieces a cell", () => {
  assert.equal(MIN_PIECES_PER_CELL, 3);
});

test("an empty catalog has all sixteen cells, every one short", () => {
  const cov = catalogCoverage(catalogOf([]));
  assert.equal(cov.cells.length, EMOTIONS.length * 2);
  assert.deepEqual(
    cov.cells.slice(0, 2).map((c) => [c.emotion, c.intensity]),
    [
      ["tension", "low"],
      ["tension", "high"],
    ],
  );
  assert.equal(cov.short.length, 16);
  assert.ok(cov.cells.every((c) => c.ids.length === 0));
});

test("a piece counts toward every emotion it is tagged with, at its one intensity", () => {
  const cov = catalogCoverage(catalogOf([validPiece({ id: "a", moodTags: ["dread", "tension"], intensity: "high" })]));
  const cell = (e: string, i: string) => cov.cells.find((c) => c.emotion === e && c.intensity === i)!.ids;
  assert.deepEqual(cell("dread", "high"), ["a"]);
  assert.deepEqual(cell("tension", "high"), ["a"]);
  assert.deepEqual(cell("dread", "low"), []);
  assert.deepEqual(cell("calm", "high"), []);
});

test("a cell with three pieces is full; two is short", () => {
  const p = (id: string, intensity: "low" | "high") => validPiece({ id, moodTags: ["calm"], intensity });
  const cov = catalogCoverage(catalogOf([p("a", "low"), p("b", "low"), p("c", "low"), p("d", "high"), p("e", "high")]));
  const short = cov.short.map((c) => `${c.emotion}/${c.intensity}`);
  assert.ok(!short.includes("calm/low"));
  assert.ok(short.includes("calm/high"));
  assert.equal(short.length, 15);
  assert.deepEqual(catalogCoverage(catalogOf([p("a", "high"), p("b", "high")]), 2).short.some((c) => c.emotion === "calm" && c.intensity === "high"), false);
});

test("the table names each cell, its count and its ids", () => {
  const text = formatCoverage(catalogCoverage(catalogOf([validPiece({ id: "a", moodTags: ["joy"], intensity: "low" })])));
  const lines = text.split("\n");
  assert.equal(lines.length, 16);
  assert.match(text, /^joy\s+low\s+1 {2}a$/m);
  assert.match(text, /^joy\s+high\s+0 {2}$/m);
});

// --- A2's standing test: the committed snapshot of the live catalog ---

const snapshot = readJson(path.join(CATALOG_DIR, "catalog.json"));

test("A2: the snapshot passes the writer's check, with no entry ignored", () => {
  const checked = checkCatalog(snapshot);
  assert.ok(checked.ok, checked.ok ? "" : checked.reasons.join("\n"));
  assert.deepEqual(readCatalog(snapshot).ignored, []);
});

test("A2: every emotion at low and high intensity has at least three pieces", () => {
  const { catalog } = readCatalog(snapshot);
  const cov = catalogCoverage(catalog);
  assert.deepEqual(
    cov.short.map((c) => `${c.emotion}/${c.intensity}: ${c.ids.length}`),
    [],
    `cells under ${MIN_PIECES_PER_CELL}:\n${formatCoverage(cov)}`,
  );
});

test("every source piece has its verdict and a snapshot entry with the same metadata, and back", () => {
  const pieces = idsIn("pieces");
  const verdicts = idsIn("verdicts");
  const entries = new Map(readCatalog(snapshot).catalog.pieces.map((p) => [p.id, p] as const));
  assert.deepEqual(verdicts, pieces, "catalog/pieces and catalog/verdicts name the same ids");
  assert.deepEqual([...entries.keys()].sort(), pieces, "the snapshot holds exactly the source pieces");
  for (const id of pieces) {
    const piece = readJson(path.join(CATALOG_DIR, "pieces", `${id}.json`)) as Record<string, unknown>;
    const verdict = readJson(path.join(CATALOG_DIR, "verdicts", `${id}.json`)) as Record<string, unknown>;
    const entry = entries.get(id) as CatalogPiece & Record<string, unknown>;
    assert.equal(piece.id, id, `${id}.json names its own id`);
    for (const [field, value] of Object.entries(piece)) {
      if (field === "duration") assert.ok(Math.abs((value as number) - entry.duration) <= 1, `${id}: duration`);
      else assert.deepEqual(entry[field], value, `${id}: ${field}`);
    }
    assert.deepEqual(entry.verdict, { ...verdict, verdict: verdict.verdict === "yes" ? "allowed" : verdict.verdict }, `${id}: verdict`);
  }
});
