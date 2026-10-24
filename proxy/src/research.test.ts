import assert from "node:assert/strict";
import { test } from "node:test";

import { addSources, buildQueries, chapterNumber, cleanEmotions, HITS_PER_QUERY, MAX_QUERIES, moodRequest, parseMoods, sourcesFor, type Source } from "./research.ts";

const book = { title: "Dracula", author: "Bram Stoker", chapters: ["Opening Credits", "Chapter 1", "Jonathan Harker's Journal", "XIV"] };

test("queries come from the title, author and chapter titles only: three for the book, then one per chapter", () => {
  const q = buildQueries(book);
  assert.deepEqual(q.slice(0, 3).map((x) => x.chapter), [null, null, null]);
  assert.ok(q.slice(0, 3).every((x) => x.q.includes('"Dracula" Bram Stoker')));
  assert.deepEqual(q.slice(3), [
    { q: '"Dracula" "Opening Credits" summary', chapter: 0 },
    { q: '"Dracula" chapter 1 summary', chapter: 1 },
    { q: `"Dracula" "Jonathan Harker's Journal" summary`, chapter: 2 },
    { q: '"Dracula" chapter 14 summary', chapter: 3 },
  ]);
});

test("a long book's queries stop at the budget; an authorless book leaves the author out", () => {
  const long = { title: "Big", author: "", chapters: Array.from({ length: 200 }, (_, i) => `Chapter ${i + 1}`) };
  const q = buildQueries(long);
  assert.equal(q.length, MAX_QUERIES);
  assert.equal(q[0].q, '"Big" chapter summaries');
});

test("chapter numbers come from the title (digits, roman, words), else the position", () => {
  assert.equal(chapterNumber("Chapter 12: The Storm", 3), 12);
  assert.equal(chapterNumber("7. Arrival", 0), 7);
  assert.equal(chapterNumber("XIV", 0), 14);
  assert.equal(chapterNumber("Chapter Twelve", 0), 12);
  assert.equal(chapterNumber("The Storm", 4), 5);
  assert.equal(chapterNumber("Civil War", 2), 3, "a word of roman letters is not a numeral");
});

test("sources: the first hits per query, one per URL, with stable ids; empty snippets skipped", () => {
  let s: Source[] = [];
  const hits = [
    { url: "https://a.example/1", title: "A", snippet: "a" },
    { url: "https://a.example/1", title: "A again", snippet: "a" },
    { url: "https://b.example/2", title: "B", snippet: " " },
    { url: "https://c.example/3", title: "C", snippet: "c" },
    { url: "https://d.example/4", title: "D", snippet: "d" },
  ];
  s = addSources(s, hits, null);
  assert.ok(s.length <= HITS_PER_QUERY);
  assert.deepEqual(s.map((x) => [x.id, x.url]), [["S1", "https://a.example/1"]]);
  s = addSources(s, [{ url: "https://e.example/5", title: "E", snippet: "e" }, { url: "https://a.example/1", title: "A", snippet: "a" }], 2);
  assert.deepEqual(s.map((x) => [x.id, x.chapter]), [["S1", null], ["S2", 2]]);
  assert.deepEqual(sourcesFor(s, [2]).map((x) => x.id), ["S2", "S1"]);
  assert.deepEqual(sourcesFor(s, [0]).map((x) => x.id), ["S1"]);
});

test("the reading request asks for emotions only, from the fixed set, never events, and lists the sources", () => {
  const sources: Source[] = [{ id: "S1", url: "https://a.example", title: "A", snippet: "about it", chapter: null }];
  const r = moodRequest(book, [1, 2], sources);
  assert.match(r.system, /Never describe what happens/);
  assert.match(r.system, /too-little/);
  assert.match(r.user, /^2\. Chapter 1$/m);
  assert.match(r.user, /\[S1\] A \(https:\/\/a\.example\)/);
  assert.equal(r.name, "chapter_moods");
});

test("emotions are cleaned: the fixed set only, clamped, one per emotion, strongest first, four at most", () => {
  assert.deepEqual(
    cleanEmotions([
      { emotion: "joy", intensity: 0.3 },
      { emotion: "rage", intensity: 0.9 },
      { emotion: "joy", intensity: 0.6 },
      { emotion: "dread", intensity: 1.7 },
      { emotion: "calm", intensity: 0 },
      { emotion: "wonder", intensity: 0.2 },
      { emotion: "sorrow", intensity: 0.4 },
      { emotion: "tension", intensity: 0.1 },
    ]),
    [
      { emotion: "dread", intensity: 1 },
      { emotion: "joy", intensity: 0.6 },
      { emotion: "sorrow", intensity: 0.4 },
      { emotion: "wonder", intensity: 0.2 },
    ],
  );
  assert.deepEqual(cleanEmotions("nope"), []);
});

test("a chapter is scored only with emotions and a real cited source; otherwise too-little with nothing kept (A19)", () => {
  const sources: Source[] = [{ id: "S1", url: "https://a.example", title: "A", snippet: "s", chapter: null }];
  const found = parseMoods(
    {
      chapters: [
        { sourceTitle: "One", sourceNumber: 1, coverage: "scored", emotions: [{ emotion: "joy", intensity: 0.5 }], sourceIds: ["S1", "S1"] },
        { sourceTitle: "Two", sourceNumber: 2, coverage: "scored", emotions: [{ emotion: "joy", intensity: 0.5 }], sourceIds: ["S9"] },
        { sourceTitle: "Three", sourceNumber: 3, coverage: "scored", emotions: [], sourceIds: ["S1"] },
        { sourceTitle: "Four", sourceNumber: -1, coverage: "too-little", emotions: [{ emotion: "joy", intensity: 0.5 }], sourceIds: ["S1"] },
        { nope: true },
      ],
    },
    sources,
  );
  assert.deepEqual(found, [
    { sourceTitle: "One", sourceNumber: 1, coverage: "scored", emotions: [{ emotion: "joy", intensity: 0.5 }], sources: [{ url: "https://a.example", title: "A" }] },
    { sourceTitle: "Two", sourceNumber: 2, coverage: "too-little", emotions: [], sources: [] },
    { sourceTitle: "Three", sourceNumber: 3, coverage: "too-little", emotions: [], sources: [] },
    { sourceTitle: "Four", sourceNumber: 0, coverage: "too-little", emotions: [], sources: [] },
  ]);
  assert.deepEqual(parseMoods(null, sources), []);
});
