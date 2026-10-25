import assert from "node:assert/strict";
import { test } from "node:test";

import { bookStateLine, chapterTimeLabel, clockTimeLabel, dayLabel, guessTitle, sameDay, speedLabel, stickerLabel } from "./labels.ts";

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

test("a book marked finished reads finished at any position", () => {
  assert.equal(bookStateLine({ ...book, finished: true }, 0, false), "2 ch · finished");
  assert.equal(bookStateLine({ ...book, finished: true }, 112, true), "2 ch · finished");
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

test("a sticker reads its emotion, and its intensity once scored (06.5)", () => {
  assert.equal(stickerLabel("Wonder"), "Wonder");
  assert.equal(stickerLabel("Wonder", 0.8), "Wonder 80%");
  assert.equal(stickerLabel("Dread", 0.333), "Dread 33%");
  assert.equal(stickerLabel("Joy", 1.4), "Joy 100%");
  assert.equal(stickerLabel("Calm", Number.NaN), "Calm");
});

test("the scoring band's times and days read plainly, on the device's clock (01.25)", () => {
  const at = (h: number, m: number, day = 24) => new Date(2026, 9, day, h, m).getTime();
  assert.equal(clockTimeLabel(at(15, 40)), "3:40 pm");
  assert.equal(clockTimeLabel(at(0, 5)), "12:05 am");
  assert.equal(clockTimeLabel(at(12, 0)), "12:00 pm");
  assert.equal(clockTimeLabel(at(9, 7)), "9:07 am");
  assert.equal(dayLabel(at(10, 0, 31)), "31 Oct");
  assert.equal(dayLabel(new Date(2026, 0, 2).getTime()), "2 Jan");
  assert.equal(sameDay(at(0, 1), at(23, 59)), true);
  assert.equal(sameDay(at(23, 59), at(0, 1, 25)), false);
});
