// The catalog inside the Worker (05.3, spec 05 A3): the bundled snapshot is the committed catalog/catalog.json, every
// entry valid; a chapter's pieces come from it; and a result cached before v2 goes out re-matched, its old piece the
// reference (D13), with no new research run.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkCatalog } from "../../src/lib/catalog.ts";
import { CATALOG, catalogChapter, catalogJobView, catalogPieces } from "./catalog.ts";
import type { ChapterResult, JobView, Piece } from "./contract.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const IDS = new Set(CATALOG.map((p) => p.id));

test("the Worker's catalog is the committed snapshot, every entry valid", () => {
  const snapshot = checkCatalog(JSON.parse(fs.readFileSync(path.join(ROOT, "catalog", "catalog.json"), "utf8")));
  assert.ok(snapshot.ok);
  assert.deepEqual(CATALOG.map((p) => p.id), snapshot.value.pieces.map((p) => p.id));
});

test("a chapter's pieces are catalog pieces as the contract names them, scene pieces only with scenes", () => {
  const flat = catalogPieces({ emotions: [{ emotion: "sorrow", intensity: 0.9 }] })!;
  for (const p of [flat.piece, ...flat.alternates]) {
    assert.ok(IDS.has(p.id));
    assert.deepEqual(Object.keys(p).sort(), ["artist", "id", "kind", "moodTags", "title", "vocals"], "nothing of the file, license or verdict");
  }
  assert.equal(flat.scenePieces, undefined);
  const scened = catalogPieces({ emotions: [{ emotion: "sorrow", intensity: 0.9 }], scenes: [{ emotions: [{ emotion: "sorrow", intensity: 0.9 }], span: 1 }] })!;
  assert.deepEqual(scened.scenePieces, [scened.piece]);
  assert.equal(catalogPieces({ emotions: [] }), null);
});

const OLD: Piece = { id: "composer-1--theme-1", title: "Theme 1", artist: "Composer 1", kind: "score", vocals: "none", moodTags: ["tension"] };
const alt = (n: number): Piece => ({ ...OLD, id: `composer-${n}--theme-${n}`, title: `Theme ${n}` });

function chapter(index: number, over: Partial<ChapterResult> = {}): ChapterResult {
  return {
    index,
    title: `Chapter ${index + 1}`,
    mood: { chapterIndex: index, chapterTitle: `Chapter ${index + 1}`, emotions: [{ emotion: "tension", intensity: 0.8 }], sources: [], coverage: "scored", model: "gpt-5-mini", version: "07.1.0", scoredAt: 1 },
    pieces: { piece: OLD, alternates: [alt(2), alt(3)] },
    ...over,
  };
}

test("a result cached before v2 goes out re-matched: catalog pieces, its old piece the reference, emotions untouched (A3)", () => {
  const unscored = chapter(1, { mood: { ...chapter(1).mood, emotions: [], coverage: "too-little" }, pieces: null });
  const view: JobView = { jobId: "a".repeat(64), state: "done", progress: { step: 1, steps: 1, chaptersDone: 2, chapters: 2 }, result: { key: "a".repeat(64), chapters: [chapter(0), unscored], model: "gpt-5-mini", version: "07.1.0", scoredAt: 1, costUsd: 0.1 } };
  const out = catalogJobView(view);
  const [c0, c1] = out.result!.chapters;
  assert.ok([c0.pieces!.piece, ...c0.pieces!.alternates].every((p) => IDS.has(p.id)));
  assert.deepEqual(c0.pieces!.reference, OLD);
  assert.deepEqual(c0.mood, chapter(0).mood);
  assert.deepEqual(c1, unscored);
  assert.deepEqual(catalogJobView(out), out, "a view already on the catalog is left as it is");
  assert.deepEqual(catalogJobView({ ...view, result: undefined }), { ...view, result: undefined });
});

test("a cached chapter that named no piece gets catalog pieces; an empty catalog leaves a chapter alone", () => {
  const none = catalogChapter(chapter(0, { pieces: null }));
  assert.ok(IDS.has(none.pieces!.piece.id));
  assert.equal(none.pieces!.reference, undefined);
  assert.deepEqual(catalogChapter(chapter(0), []), chapter(0));
});
