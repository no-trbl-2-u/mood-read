import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchGutenbergText, gutenbergBookUrl, gutenbergTextUrl, MIN_CHAPTER_WORDS, NoText, splitChapters, stripBoilerplate } from "./gutenberg.ts";

/** Prose of n words, marked so a test can tell whose text it is. */
export const prose = (mark: string, n = MIN_CHAPTER_WORDS + 20) => Array.from({ length: n }, (_, k) => (k % 12 === 0 ? mark : "word")).join(" ");

const HEADER = [
  "The Project Gutenberg eBook of Alice's Adventures in Wonderland",
  "",
  "This ebook is for the use of anyone anywhere in the United States and most other parts of the world at no cost.",
  "",
  "*** START OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***",
].join("\n");
const FOOTER = [
  "*** END OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***",
  "",
  "Updated editions will replace the previous one--the old editions will be renamed.",
  "START: FULL LICENSE",
  "THE FULL PROJECT GUTENBERG LICENSE",
].join("\n");

test("the header and license footer are stripped: only the book's own text is left", () => {
  const raw = `﻿${HEADER}\r\n\r\nCHAPTER I.\r\nDown the Rabbit-Hole\r\n\r\nAlice was beginning to get very tired.\r\n\r\n${FOOTER}`;
  const text = stripBoilerplate(raw);
  assert.ok(text.startsWith("CHAPTER I."));
  assert.ok(text.endsWith("very tired."));
  assert.doesNotMatch(text, /PROJECT GUTENBERG|LICENSE|\r/i);
});

test("older marker forms are stripped too: THIS ... EBOOK, the small print header, the End of footer", () => {
  const old = "Header\n*** START OF THIS PROJECT GUTENBERG EBOOK DRACULA ***\nThe text.\nEnd of the Project Gutenberg EBook of Dracula\n*** END OF THIS PROJECT GUTENBERG EBOOK DRACULA ***\nLicense";
  assert.equal(stripBoilerplate(old), "The text.");
  const small = "Legalese\n*END*THE SMALL PRINT! FOR PUBLIC DOMAIN ETEXTS*Ver.04.29.93*END*\nThe text.\nEnd of Project Gutenberg's Etext of Dracula";
  assert.equal(stripBoilerplate(small), "The text.");
  assert.equal(stripBoilerplate("  No markers at all.  "), "No markers at all.");
});

test("chapters split at their headings, with a title on the heading line or the next", () => {
  const text = [
    "CHAPTER I.",
    "Down the Rabbit-Hole",
    "",
    prose("alpha"),
    "",
    "CHAPTER II. The Pool of Tears",
    "",
    prose("beta"),
    "",
    "Chapter 3",
    "",
    prose("gamma"),
  ].join("\n");
  const ch = splitChapters(text);
  assert.deepEqual(
    ch.map((c) => [c.title, c.number]),
    [
      ["Chapter I: Down the Rabbit-Hole", 1],
      ["Chapter II: The Pool of Tears", 2],
      ["Chapter 3", 3],
    ],
  );
  assert.match(ch[0].text, /alpha/);
  assert.doesNotMatch(ch[0].text, /beta|Rabbit-Hole/);
  assert.match(ch[2].text, /gamma/);
});

test("roman-numeral headings in capitals count as chapters (I. A SCANDAL IN BOHEMIA)", () => {
  const ch = splitChapters(["I. A SCANDAL IN BOHEMIA", "", prose("one"), "", "II.", "", "THE RED-HEADED LEAGUE", "", prose("two")].join("\n"));
  assert.deepEqual(ch.map((c) => [c.title, c.number]), [["Chapter I: A SCANDAL IN BOHEMIA", 1], ["Chapter II: THE RED-HEADED LEAGUE", 2]]);
});

test("the table of contents never counts as chapters, whether spaced out or packed", () => {
  const packed = ["Contents", "", "CHAPTER I. Down the Rabbit-Hole", "CHAPTER II. The Pool of Tears", "CHAPTER III. A Caucus-Race", ...Array.from({ length: 40 }, (_, k) => `CHAPTER ${k + 4}. A Long Contents Line About Things And More Things`)];
  const spaced = ["", "CHAPTER I.     Down the Rabbit-Hole", "", "CHAPTER II.    The Pool of Tears", ""];
  const body = ["", "CHAPTER I.", "Down the Rabbit-Hole", "", prose("alpha"), "", "CHAPTER II.", "The Pool of Tears", "", prose("beta")];
  for (const contents of [packed, spaced]) {
    const ch = splitChapters([...contents, ...body].join("\n"));
    assert.deepEqual(ch.map((c) => c.number), [1, 2], contents === packed ? "packed" : "spaced");
    assert.match(ch[0].text, /alpha/);
  }
});

test("a part or book heading ends a chapter and is never one; numbers repeated across parts are dropped (A19)", () => {
  const text = ["PART ONE", "", "CHAPTER I.", "", prose("p1c1"), "", "CHAPTER II.", "", prose("p1c2"), "", "BOOK THE SECOND", "", prose("intro"), "", "CHAPTER I.", "", prose("p2c1")].join("\n");
  const ch = splitChapters(text);
  assert.equal(ch.length, 3);
  assert.ok(ch.every((c) => c.number === 0), "a part's chapter 1 can never be matched as the book's chapter 1");
  assert.doesNotMatch(ch[1].text, /intro/, "a part heading ends the chapter before it");
});

test("a text with no chapter headings has no chapters", () => {
  assert.deepEqual(splitChapters(prose("x", 1000)), []);
});

test("the text is fetched from Project Gutenberg's mirror by number; a missing book is NoText (A10)", async () => {
  const urls: string[] = [];
  const text = await fetchGutenbergText("11", async (url, init) => {
    urls.push(url);
    assert.match(String((init?.headers as Record<string, string>)["user-agent"]), /^MoodRead\//);
    return new Response("the book");
  });
  assert.equal(text, "the book");
  assert.deepEqual(urls, ["https://gutenberg.pglaf.org/cache/epub/11/pg11.txt"]);
  assert.equal(gutenbergTextUrl("1342"), "https://gutenberg.pglaf.org/cache/epub/1342/pg1342.txt");
  assert.equal(gutenbergBookUrl("1342"), "https://www.gutenberg.org/ebooks/1342");
  await assert.rejects(fetchGutenbergText("9", async () => new Response("", { status: 404 })), NoText);
  await assert.rejects(fetchGutenbergText("9", async () => new Response("", { status: 503 })), (e) => !(e instanceof NoText));
});
