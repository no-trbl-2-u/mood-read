// Spec 01 A6: chapters from markers, else one per file, else silences; rename, merge and split.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canMergeWithNext,
  canSplitAt,
  deriveChapters,
  mergeWithNext,
  renameChapter,
  splitChapter,
  type FileForChapters,
} from "./chapters.ts";

const file = (name: string, duration: number, extra: Partial<FileForChapters> = {}): FileForChapters => ({
  name,
  duration,
  markers: [],
  ...extra,
});

const spans = (cs: { title: string; start: number; end: number }[]) => cs.map((c) => [c.title, c.start, c.end]);

test("markers win: one file's markers become its chapters, the first starting with the file", () => {
  const { chapters, source } = deriveChapters("b", [
    file("book.m4b", 300, {
      markers: [
        { title: "Opening", start: 0.2 },
        { title: "", start: 100 },
        { title: "The End", start: 250 },
      ],
    }),
  ]);
  assert.equal(source, "markers");
  assert.deepEqual(spans(chapters), [
    ["Opening", 0, 100],
    ["Chapter 2", 100, 250],
    ["The End", 250, 300],
  ]);
  assert.deepEqual(
    chapters.map((c) => [c.index, c.fileIndex, c.bookId]),
    [
      [0, 0, "b"],
      [1, 0, "b"],
      [2, 0, "b"],
    ],
  );
});

test("markers across files are laid end to end; a file without markers is one chapter", () => {
  const { chapters } = deriveChapters("b", [
    file("1.mp3", 100, { markers: [{ title: "A", start: 0 }, { title: "B", start: 40 }] }),
    file("2.mp3", 50, { title: "Part Two" }),
    file("3.mp3", 60, { markers: [{ title: "C", start: 0 }, { title: "D", start: 30 }] }),
  ]);
  assert.deepEqual(spans(chapters), [
    ["A", 0, 40],
    ["B", 40, 100],
    ["2", 100, 150],
    ["C", 150, 180],
    ["D", 180, 210],
  ]);
  assert.deepEqual(
    chapters.map((c) => c.fileIndex),
    [0, 0, 1, 2, 2],
  );
});

test("markers past a file's end or a hair apart are dropped", () => {
  const { chapters } = deriveChapters("b", [
    file("x.m4b", 100, { markers: [{ title: "A", start: 0 }, { title: "A2", start: 0.1 }, { title: "Z", start: 150 }] }),
  ]);
  assert.deepEqual(spans(chapters), [["A", 0, 100]]);
});

test("no markers, several files: one chapter per file, titled by their distinct title tags, else names", () => {
  const tagged = deriveChapters("b", [
    file("01.mp3", 10, { title: "Prologue" }),
    file("02.mp3", 20, { title: "Chapter One" }),
  ]);
  assert.equal(tagged.source, "files");
  assert.deepEqual(spans(tagged.chapters), [
    ["Prologue", 0, 10],
    ["Chapter One", 10, 30],
  ]);
  // The same title on every file says nothing about the chapter: fall back to the names.
  const same = deriveChapters("b", [file("Book - 01.mp3", 10, { title: "Book" }), file("Book - 02.mp3", 20, { title: "Book" })]);
  assert.deepEqual(
    same.chapters.map((c) => c.title),
    ["Book - 01", "Book - 02"],
  );
});

test("no markers, one file: silences break it; without them it is one chapter", () => {
  const split = deriveChapters("b", [file("long.mp3", 600)], [400, 200, 0, 700]);
  assert.equal(split.source, "silences");
  assert.deepEqual(spans(split.chapters), [
    ["Chapter 1", 0, 200],
    ["Chapter 2", 200, 400],
    ["Chapter 3", 400, 600],
  ]);
  const single = deriveChapters("b", [file("long.mp3", 600)]);
  assert.equal(single.source, "single");
  assert.deepEqual(spans(single.chapters), [["Chapter 1", 0, 600]]);
  // Silences never override files or markers.
  assert.equal(deriveChapters("b", [file("a.mp3", 5), file("b.mp3", 5)], [3]).source, "files");
});

const files = [{ duration: 100 }, { duration: 100 }];
const base = deriveChapters("b", [file("a.mp3", 100), file("b.mp3", 100)]).chapters;

test("rename trims, and an empty name keeps the old one", () => {
  assert.equal(renameChapter(base, 1, "  The Storm ")[1].title, "The Storm");
  assert.equal(renameChapter(base, 1, "   ")[1].title, "b");
  assert.equal(renameChapter(base, 0, "X")[1].title, "b");
});

test("merge with next joins two chapters under the first's title and renumbers", () => {
  const merged = mergeWithNext(base, files, 0);
  assert.deepEqual(spans(merged), [["a", 0, 200]]);
  assert.equal(merged[0].index, 0);
  assert.equal(canMergeWithNext(merged, 0), false);
  assert.equal(mergeWithNext(merged, files, 0), merged);
});

test("split at a position makes two chapters there, the second one in the file it starts in", () => {
  const one = mergeWithNext(base, files, 0);
  assert.ok(canSplitAt(one, 150));
  const split = splitChapter(one, files, 150);
  assert.deepEqual(spans(split), [
    ["a", 0, 150],
    ["a, part 2", 150, 200],
  ]);
  assert.deepEqual(
    split.map((c) => [c.index, c.fileIndex]),
    [
      [0, 0],
      [1, 1],
    ],
  );
  // Too near an edge, or outside every chapter: unchanged.
  assert.equal(canSplitAt(split, 150.5), false);
  assert.equal(splitChapter(split, files, 0.2), split);
  assert.equal(splitChapter(split, files, 500), split);
});
