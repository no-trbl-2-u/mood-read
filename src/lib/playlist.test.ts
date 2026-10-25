import assert from "node:assert/strict";
import { test } from "node:test";

import { validPiece } from "./catalog-fixtures.ts";
import { pieceKey, type CatalogPiece } from "./catalog.ts";
import {
  booksToRelease,
  diffPlaylist,
  planBuild,
  playlistPieces,
  playlistStatus,
  recordOf,
  unreferenced,
  type PlaylistRecord,
} from "./playlist.ts";
import type { ChapterScore, Download, DownloadState } from "./types.ts";

const p = (id: string, bytes = 1000, over: Partial<CatalogPiece> = {}): CatalogPiece => {
  const sha = (id.charCodeAt(0).toString(16).padStart(2, "0") + id.length.toString(16).padStart(2, "0")).repeat(16);
  return validPiece({ id, title: id, file: { key: pieceKey(sha, "aac"), sha256: sha, bytes, format: "aac", contentType: "audio/mp4" }, ...over });
};
const catalog = (...pieces: CatalogPiece[]) => new Map(pieces.map((x) => [x.id, x]));

const chapter = (index: number) => ({ index, title: `Chapter ${index + 1}` });
function score(index: number, piece: string, alternates: string[] = [], over: { pick?: string; scenePieces?: string[]; scenes?: number; coverage?: string; title?: string } = {}): ChapterScore {
  const scenes = over.scenes ? Array.from({ length: over.scenes }, () => ({ emotions: [{ emotion: "calm" as const, intensity: 0.5 }], span: 1 / over.scenes! })) : undefined;
  return {
    mood: {
      chapterIndex: index,
      chapterTitle: over.title ?? `Chapter ${index + 1}`,
      emotions: over.coverage === "too-little" ? [] : [{ emotion: "calm", intensity: 0.5 }],
      ...(scenes ? { scenes } : {}),
      sources: [],
      coverage: (over.coverage ?? "scored") as "scored",
      model: "m",
      version: "v",
      scoredAt: 1,
    },
    pieces: [],
    playlist: over.coverage === "too-little" ? null : { chapterIndex: index, piece, alternates, pick: over.pick ?? "auto", ...(over.scenePieces ? { scenePieces: over.scenePieces } : {}) },
  };
}

let n = 0;
function dl(pieceId: string, state: DownloadState, bytes = 0, totalBytes: number | null = null): Download {
  n++;
  return { id: `d${n}`, target: { kind: "piece", pieceId }, state, bytes, totalBytes, error: state === "failed" ? "dropped" : null, attempts: 0, queuedAt: n, updatedAt: n };
}

const rec = (bookId: string, ...pieces: CatalogPiece[]): PlaylistRecord => recordOf(bookId, pieces, 1);

test("A4: a book's playlist is each chapter's pick, else auto, once each, in chapter order", () => {
  const cat = catalog(p("a"), p("b"), p("c"));
  const chapters = [chapter(0), chapter(1), chapter(2)];
  const scores = [score(0, "a", ["b"]), score(1, "a", ["c"], { pick: "c" }), score(2, "b")];
  assert.deepEqual(playlistPieces(chapters, scores, cat).map((x) => x.id), ["a", "c", "b"]);
});

test("A4: scene pieces that differ are in the playlist, so offline covers every scene; a pick covers them all", () => {
  const cat = catalog(p("a"), p("s1"), p("s2"), p("pick"));
  const chapters = [chapter(0), chapter(1)];
  const scenes = [score(0, "a", ["pick"], { scenes: 2, scenePieces: ["s1", "s2"] }), score(1, "a", ["pick"], { scenes: 2, scenePieces: ["s1", "s2"], pick: "pick" })];
  assert.deepEqual(playlistPieces(chapters, scenes, cat).map((x) => x.id), ["s1", "s2", "pick"]);
});

test("A4: an unscored chapter, a chapter renamed since scoring, and a piece that may not play add nothing", () => {
  const cat = catalog(p("a"), p("bad", 1000, { license: { id: "cc-by-nc" as never, version: "4.0", url: null } }));
  const chapters = [chapter(0), chapter(1), chapter(2), chapter(3)];
  const scores = [score(0, "a"), score(1, "x", [], { coverage: "too-little" }), score(2, "a", [], { title: "Old title" }), score(3, "bad")];
  assert.deepEqual(playlistPieces(chapters, scores, cat).map((x) => x.id), ["a"]);
  assert.deepEqual(playlistPieces(chapters, [score(1, "x", [], { coverage: "too-little" })], cat), [], "an unscored book has no playlist");
  assert.deepEqual(playlistPieces(chapters, [score(0, "not-in-catalog")], cat), [], "a piece outside the catalog never downloads");
});

test("A4: building queues what has no download, retries a failed one, resumes a paused one, leaves the rest", () => {
  const needed = [p("a"), p("b"), p("c"), p("d"), p("e")];
  const failed = dl("c", "failed");
  const paused = dl("d", "paused");
  const downloads = [dl("a", "done", 1000), dl("b", "running", 10), failed, paused, dl("other", "failed")];
  assert.deepEqual(planBuild(needed, downloads), { queue: ["e"], retry: [failed.id], resume: [paused.id] });
});

test("A4: progress counts pieces and bytes over the catalog's sizes; done once every piece is on the device", () => {
  const needed = [p("a", 1000), p("b", 3000)];
  assert.equal(playlistStatus(needed, [], false).state, "unbuilt");
  assert.deepEqual(playlistStatus(needed, [dl("a", "done", 1000), dl("b", "running", 1500, 3000)], true), {
    state: "building",
    done: 1,
    total: 2,
    bytes: 2500,
    totalBytes: 4000,
    failed: 0,
    paused: 0,
  });
  assert.equal(playlistStatus(needed, [dl("a", "done", 1000), dl("b", "queued")], true).state, "building");
  assert.equal(playlistStatus(needed, [dl("a", "done", 1000), dl("b", "failed")], true).state, "failed");
  assert.equal(playlistStatus(needed, [dl("a", "done", 1000), dl("b", "paused", 10)], true).state, "paused");
  const done = playlistStatus(needed, [dl("a", "done", 1000), dl("b", "done", 3000)], true);
  assert.equal(done.state, "done");
  assert.equal(done.bytes, 4000);
  assert.equal(playlistStatus([], [], true).state, "unbuilt", "nothing to build reads as nothing built");
});

test("A5: a changed pick adds the new piece and drops the old one; an unchanged playlist changes nothing", () => {
  const before = rec("book", p("a"), p("b"));
  assert.deepEqual(diffPlaylist(before, [p("a"), p("b")]), { add: [], drop: [] });
  const d = diffPlaylist(before, [p("a"), p("c")]);
  assert.deepEqual(d.add.map((x) => x.id), ["c"]);
  assert.deepEqual(d.drop, [{ id: "b", key: p("b").file.key }]);
});

test("A5, A8: a released piece's file goes only when no book's playlist on the device still has it", () => {
  const released = [{ id: "a", key: "pieces/a.m4a" }, { id: "b", key: "pieces/b.m4a" }];
  const records: PlaylistRecord[] = [
    { bookId: "one", pieces: [{ id: "c", key: "pieces/c.m4a" }], builtAt: 1 },
    { bookId: "two", pieces: [{ id: "b", key: "pieces/b.m4a" }], builtAt: 2 },
  ];
  assert.deepEqual(unreferenced(released, records), [{ id: "a", key: "pieces/a.m4a" }]);
  assert.deepEqual(unreferenced(released, []), released);
  assert.deepEqual(unreferenced([...released, released[0]], []), released, "each file once");
});

test("the web build keeps one book's playlist: building another releases the rest; phones keep every book's", () => {
  const records = [rec("one", p("a")), rec("two", p("b")), rec("three", p("c"))];
  assert.deepEqual(booksToRelease("two", records, 1), ["one", "three"]);
  assert.deepEqual(booksToRelease("two", records, Infinity), []);
  assert.deepEqual(booksToRelease("four", [rec("one", p("a"))], 1), ["one"]);
});
