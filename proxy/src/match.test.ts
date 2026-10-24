import assert from "node:assert/strict";
import { test } from "node:test";

import { matchChapters, titleKey } from "./match.ts";
import type { FoundChapter } from "./research.ts";

const f = (sourceTitle: string, sourceNumber: number): FoundChapter => ({
  sourceTitle,
  sourceNumber,
  coverage: "scored",
  emotions: [{ emotion: "calm", intensity: 0.5 }],
  sources: [{ url: "https://a.example", title: "A" }],
});

test("title keys drop chapter numbering, a leading 'the', case and punctuation", () => {
  assert.equal(titleKey("Chapter 3: The Storm!"), "storm");
  assert.equal(titleKey("the storm"), "storm");
  assert.equal(titleKey("12. Arrival"), "arrival");
  assert.equal(titleKey("Chapter 3"), "");
  assert.equal(titleKey("Chapter Twelve"), "");
});

test("found chapters match by title first, whatever their order", () => {
  const titles = ["Opening Credits", "Chapter 1: The Storm", "Chapter 2: Arrival"];
  const m = matchChapters([f("Arrival", 2), f("The Storm", 1)], titles, [0, 1, 2]);
  assert.equal(m.get(1)?.sourceTitle, "The Storm");
  assert.equal(m.get(2)?.sourceTitle, "Arrival");
  assert.equal(m.has(0), false, "credits match nothing and stay unscored");
});

test("untitled chapters match by order: the chapter's number against the sources' numbering", () => {
  const titles = ["Opening Credits", "Chapter 1", "Chapter 2", "Chapter 3"];
  const m = matchChapters([f("Chapter One", 1), f("Chapter Two", 2)], titles, [0, 1, 2, 3]);
  assert.equal(m.get(1)?.sourceTitle, "Chapter One");
  assert.equal(m.get(2)?.sourceTitle, "Chapter Two");
  assert.equal(m.has(3), false, "nothing found for chapter 3: unscored, not a neighbour's mood");
  assert.equal(m.has(0), false);
});

test("each found chapter is used once, and only within the batch", () => {
  const titles = ["The Storm", "The Storm (continued)", "Calm"];
  const m = matchChapters([f("The Storm", 0)], titles, [0, 1]);
  assert.equal(m.get(0)?.sourceTitle, "The Storm");
  assert.equal(m.has(1), false);
  assert.equal(m.has(2), false);
});

test("short titles never match by containment", () => {
  const m = matchChapters([f("Red", 0)], ["Redemption"], [0]);
  assert.equal(m.size, 0);
});

test("the same title word for word wins over numbering", () => {
  const titles = ["Opening Credits", "Chapter 1"];
  const m = matchChapters([f("Opening Credits", 1), f("Chapter 1", 2)], titles, [0, 1]);
  assert.equal(m.get(0)?.sourceTitle, "Opening Credits");
  assert.equal(m.get(1)?.sourceTitle, "Chapter 1");
});

test("unnumbered audiobook chapters never take the sources' chapters by position: no neighbour's mood (A19)", () => {
  const titles = ["Opening Credits", "The Boy Who Lived", "The Vanishing Glass"];
  const m = matchChapters([f("Chapter One", 1), f("Chapter Two", 2)], titles, [0, 1, 2]);
  assert.equal(m.size, 0, "nothing names these chapters: they stay unscored rather than shifted by one");
});

test("a short title never takes a longer title's summary when that title is in the book (A19)", () => {
  const m = matchChapters([f("Homecoming", 5)], ["Home", "Chapter 5: Homecoming"], [0, 1]);
  assert.equal(m.get(1)?.sourceTitle, "Homecoming");
  assert.equal(m.has(0), false);
});

test("containment matches whole words only", () => {
  assert.equal(matchChapters([f("Homecoming", 0)], ["Home"], [0]).size, 0);
  assert.equal(matchChapters([f("The Storm Breaks", 0)], ["Chapter 4: The Storm"], [0]).get(0)?.sourceTitle, "The Storm Breaks");
});

test("parts, books, discs, tracks and file numbers never take the sources' chapter of that number (A19)", () => {
  const ch2 = [f("Chapter 2: The Letter", 2)];
  for (const titles of [
    ["Part 1", "Part 2", "Part 3"],
    ["Book 1", "Book 2"],
    ["Section 1", "Section 2"],
    ["Disc 2", "Track 2", "02 - Track"],
    ["01", "02", "03"],
    ["I", "II", "III"],
  ]) {
    const m = matchChapters(ch2, titles, titles.map((_, i) => i));
    assert.equal(m.size, 0, `${titles.join(", ")}: no chapter number, so unscored`);
  }
});

test("a chapter numbered as a chapter still matches by order, in digits, roman numerals or words (A19)", () => {
  const titles = ["Opening Credits", "Ch. 1", "Chapter II", "Chapter Three"];
  const m = matchChapters([f("Chapter 3", 3), f("Chapter 1", 1), f("Chapter 2", 2)], titles, [0, 1, 2, 3]);
  assert.equal(m.get(1)?.sourceNumber, 1);
  assert.equal(m.get(2)?.sourceNumber, 2);
  assert.equal(m.get(3)?.sourceNumber, 3);
  assert.equal(m.has(0), false);
});
