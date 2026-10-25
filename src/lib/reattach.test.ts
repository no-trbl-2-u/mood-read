import assert from "node:assert/strict";
import { test } from "node:test";

import { DURATION_TOLERANCE, durationsMatch, matchReattach, matchText, redownloaded, withFiles } from "./reattach.ts";
import type { Book } from "./types.ts";

function book(over: Partial<Book> = {}): Book {
  return {
    id: "a",
    title: "The Quiet Harbor",
    author: "Ada Lindqvist",
    narrator: "",
    cover: "idb:a/cover",
    files: [
      { ref: "idb:a/0", name: "01.mp3", duration: 1800 },
      { ref: "idb:a/1", name: "02.mp3", duration: 1200 },
    ],
    chapters: [
      { bookId: "a", index: 0, title: "Harbor (renamed)", fileIndex: 0, start: 0, end: 1800 },
      { bookId: "a", index: 1, title: "Tide", fileIndex: 1, start: 1800, end: 3000 },
    ],
    duration: 3000,
    addedAt: 7,
    lastPlayedAt: 99,
    source: { kind: "import" },
    onDevice: false,
    ...over,
  };
}

test("A7: the same book's file matches by title, author and duration, whatever its case or punctuation", () => {
  assert.deepEqual(matchReattach(book(), { title: "the quiet harbor", author: "Ada  Lindqvist.", durations: [1801, 1203] }), { ok: true });
  assert.equal(matchText("Les Misérables!"), "les miserables");
});

test("A7: a different book, author, file count or length is refused and says which", () => {
  const b = book();
  assert.deepEqual(matchReattach(b, { title: "The Loud Harbor", author: "Ada Lindqvist", durations: [1800, 1200] }), { ok: false, reason: "title" });
  assert.deepEqual(matchReattach(b, { title: "The Quiet Harbor", author: "Someone Else", durations: [1800, 1200] }), { ok: false, reason: "author" });
  assert.deepEqual(matchReattach(b, { title: "The Quiet Harbor", author: "Ada Lindqvist", durations: [3000] }), { ok: false, reason: "files" });
  assert.deepEqual(matchReattach(b, { title: "The Quiet Harbor", author: "Ada Lindqvist", durations: [1800, 1500] }), { ok: false, reason: "duration" });
});

test("the duration tolerance is 10 seconds, or 1% of a longer book", () => {
  assert.equal(DURATION_TOLERANCE.seconds, 10);
  assert.equal(durationsMatch(600, 610), true);
  assert.equal(durationsMatch(600, 611), false);
  assert.equal(durationsMatch(36_000, 36_350), true);
  assert.equal(durationsMatch(36_000, 36_400), false);
  assert.equal(durationsMatch(600, Number.NaN), false);
});

test("A7: the file comes back to the same book: chapters, durations and history kept, only the refs change", () => {
  const back = withFiles(book(), [
    { ref: "idb:a/0", name: "Harbor 1.mp3" },
    { ref: "idb:a/1", name: "Harbor 2.mp3" },
  ]);
  assert.equal(back.onDevice, true);
  assert.deepEqual(back.chapters, book().chapters);
  assert.deepEqual(
    back.files.map((f) => [f.name, f.duration]),
    [
      ["Harbor 1.mp3", 1800],
      ["Harbor 2.mp3", 1200],
    ],
  );
  assert.equal(back.cover, "idb:a/cover");
  assert.equal(back.lastPlayedAt, 99);
});

test("A7: a LibriVox book downloaded again keeps the shelf's copy; a re-cut item keeps when it was added and played", () => {
  const prior = book({ source: { kind: "librivox", librivoxId: "x" } });
  const fresh = book({
    files: prior.files.map((f, i) => ({ ...f, ref: `file:///new/${i}`, duration: f.duration + 0.4 })),
    chapters: prior.chapters.map((c, i) => ({ ...c, title: `Chapter ${i}` })),
    cover: "file:///new/cover.jpg",
    addedAt: 500,
    lastPlayedAt: null,
    onDevice: true,
    source: { kind: "librivox", librivoxId: "x", gutenbergId: "12" },
  });
  const again = redownloaded(prior, fresh);
  assert.equal(again.onDevice, true);
  assert.deepEqual(
    again.files.map((f) => f.ref),
    ["file:///new/0", "file:///new/1"],
  );
  assert.deepEqual(again.chapters, prior.chapters);
  assert.equal(again.cover, "file:///new/cover.jpg");
  assert.equal(again.addedAt, 7);
  assert.equal(again.lastPlayedAt, 99);
  assert.deepEqual(again.source, fresh.source);

  const recut = redownloaded(prior, { ...fresh, files: [fresh.files[0]!] });
  assert.equal(recut.files.length, 1);
  assert.equal(recut.addedAt, 7);
  assert.equal(recut.lastPlayedAt, 99);
  assert.equal(redownloaded(undefined, fresh), fresh);
});
