import assert from "node:assert/strict";
import { test } from "node:test";

import type { Kv } from "./library-store.ts";
import { createScoringStore, toBookScores } from "./scoring-store.ts";
import type { Book, JobView } from "./types.ts";

const ID = "a".repeat(64);
const piece = (id: string) => ({ id, title: `Theme ${id}`, artist: "A", kind: "score" as const, vocals: "none" as const, moodTags: ["calm" as const] });

function chapters(titles: string[]): Pick<Book, "chapters"> {
  return { chapters: titles.map((title, index) => ({ bookId: "b", index, title, fileIndex: 0, start: index * 10, end: index * 10 + 10 })) };
}

function doneView(titles: string[]): JobView {
  return {
    jobId: ID,
    state: "done",
    progress: { step: 1, steps: 1, chaptersDone: titles.length, chapters: titles.length },
    result: {
      key: ID,
      model: "m",
      version: "v",
      scoredAt: 1,
      costUsd: 0.1,
      chapters: titles.map((title, index) => ({
        index,
        title,
        mood: { chapterIndex: index, chapterTitle: title, emotions: [{ emotion: "calm", intensity: 0.5 }], sources: [], coverage: "scored", model: "m", version: "v", scoredAt: 1 },
        pieces: { piece: piece(`p${index}`), alternates: [piece(`q${index}`), piece(`r${index}`)] },
      })),
    },
  };
}

function mapKv(): Kv {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

test("chapters come back with the proxy's whitespace and the first listener's casing, and are still kept (A13, A19)", () => {
  const book = chapters(["01 - The  Storm", "Chapter One"]);
  const scores = toBookScores(book, doneView(["01 - The Storm", "chapter one"]), null)!;
  assert.equal(scores.chapters.length, 2);
  const store = createScoringStore(mapKv());
  store.saveScores("b", scores);
  for (const c of book.chapters) {
    const s = store.chapterScore("b", c);
    assert.ok(s, c.title);
    assert.equal(s.mood.chapterTitle, c.title, "stored under the device's own title");
  }
});

test("a chapter whose title really differs is not given the score", () => {
  const scores = toBookScores(chapters(["The Storm", "Arrival"]), doneView(["The Storm", "Departure"]), null)!;
  assert.deepEqual(scores.chapters.map((c) => c.mood.chapterIndex), [0]);
});

test("a listener's pick survives a rescore that comes back with different spacing or casing", () => {
  const book = chapters(["The  Storm"]);
  const first = toBookScores(book, doneView(["The Storm"]), null)!;
  first.chapters[0].playlist!.pick = "q0";
  const again = toBookScores(book, doneView(["THE STORM"]), first)!;
  assert.equal(again.chapters[0].playlist!.pick, "q0");
});
