import assert from "node:assert/strict";
import { test } from "node:test";

import { bookStateLine, chapterTimeLabel, guessTitle, speedLabel } from "./labels.ts";

const chapters = [
  { bookId: "b", index: 0, title: "One", fileIndex: 0, start: 0, end: 100 },
  { bookId: "b", index: 1, title: "Two", fileIndex: 1, start: 100, end: 400 },
];
const book = { chapters, duration: 400 };

test("a book never opened reads not started", () => {
  assert.equal(bookStateLine(book, 0, false), "2 ch · not started");
  assert.equal(bookStateLine(book, 0, true), "2 ch · not started");
});

test("the last played book reads resuming and its chapter", () => {
  assert.equal(bookStateLine(book, 112, true), "2 ch · resuming Ch.2");
});

test("another started book reads its share done, at least 1%", () => {
  assert.equal(bookStateLine(book, 112, false), "2 ch · 28% done");
  assert.equal(bookStateLine(book, 0.5, false), "2 ch · 1% done");
});

test("a finished book reads finished", () => {
  assert.equal(bookStateLine(book, 400, true), "2 ch · finished");
});

test("a bookmark reads its chapter and the time within it", () => {
  assert.equal(chapterTimeLabel(chapters, 112.7), "Ch. 2 — 0:12");
  assert.equal(chapterTimeLabel(chapters, 0), "Ch. 1 — 0:00");
  assert.equal(chapterTimeLabel([], 65), "Ch. 1 — 1:05");
});

test("speeds read with one decimal and an x", () => {
  assert.equal(speedLabel(1), "1.0x");
  assert.equal(speedLabel(0.5), "0.5x");
  assert.equal(speedLabel(1.3), "1.3x");
  assert.equal(speedLabel(3), "3.0x");
});

test("a book's title comes from its file names", () => {
  assert.equal(guessTitle(["Dune - 01.mp3", "Dune - 02.mp3"]), "Dune");
  assert.equal(guessTitle(["Emma Chapter 1.m4a", "Emma Chapter 2.m4a"]), "Emma");
  assert.equal(guessTitle(["walden.m4b"]), "walden");
  assert.equal(guessTitle(["a.mp3", "b.mp3"]), "a");
  assert.equal(guessTitle([]), "Untitled");
});
