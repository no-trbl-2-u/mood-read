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
