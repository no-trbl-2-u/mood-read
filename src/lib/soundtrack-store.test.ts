import assert from "node:assert/strict";
import { test } from "node:test";

import { createLibraryStore, type Kv } from "./library-store.ts";
import { createSoundtrackStore, piecesPlayed, SOUNDTRACK_KEY, soundtrackView } from "./soundtrack-store.ts";
import type { Book, BookScores, ChapterScore, Piece } from "./types.ts";

function mapKv(map = new Map<string, string>()): Kv {
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const piece = (n: number): Piece => ({
  id: `p${n}`,
  title: `Theme ${n}`,
  artist: `Composer ${n}`,
  kind: "score",
  vocals: "none",
  moodTags: ["tension"],
});

function score(over: Partial<ChapterScore["playlist"] & object> = {}, scenes?: number): ChapterScore {
  return {
    mood: {
      chapterIndex: 0,
      chapterTitle: "One",
      emotions: [{ emotion: "tension", intensity: 0.8 }],
      scenes: scenes ? Array.from({ length: scenes }, () => ({ emotions: [{ emotion: "tension", intensity: 0.8 }], span: 1 / scenes })) : undefined,
      sources: [],
      coverage: "scored",
      model: "m",
      version: "v",
      scoredAt: 1,
    },
    pieces: [piece(1), piece(2), piece(3), piece(4)],
    playlist: { chapterIndex: 0, piece: "p1", alternates: ["p2", "p3"], pick: "auto", ...over },
  };
}

test("A9: the piece that plays for a chapter is the named one, or the listener's pick over it", () => {
  assert.deepEqual(piecesPlayed(score()), ["p1"]);
  assert.deepEqual(piecesPlayed(score({ pick: "p3" })), ["p3"]);
  // A pick that is not one of the alternates is ignored, as the mood card ignores it.
  assert.deepEqual(piecesPlayed(score({ pick: "nope" })), ["p1"]);
});

test("A9: a reached chapter's scene pieces count as played too, once each, unless a pick covers the chapter", () => {
  assert.deepEqual(piecesPlayed(score({ scenePieces: ["p1", "p4", "p1"] }, 3)), ["p1", "p4"]);
  assert.deepEqual(piecesPlayed(score({ pick: "p2", scenePieces: ["p1", "p4", "p1"] }, 3)), ["p2"]);
  // An id the score does not hold (so it has no title or artist) is not logged.
  assert.deepEqual(piecesPlayed(score({ scenePieces: ["p1", "ghost"] }, 2)), ["p1"]);
});

test("A9: an unscored chapter, or one with no piece, plays nothing for the soundtrack", () => {
  const s = score();
  assert.deepEqual(piecesPlayed({ ...s, mood: { ...s.mood, coverage: "too-little", emotions: [] }, playlist: null }), []);
  assert.deepEqual(piecesPlayed({ ...s, playlist: null }), []);
});

test("A9: a piece is logged once per book, in the order it first played, with no time or position", () => {
  const map = new Map<string, string>();
  const store = createSoundtrackStore(mapKv(map));
  let calls = 0;
  store.subscribe(() => calls++);
  assert.deepEqual(store.entries(), []);
  store.log("a", ["p1"]);
  store.log("a", ["p2", "p1"]);
  store.log("b", ["p1"]);
  store.log("a", ["p1", "p2"]);
  assert.deepEqual(store.entries(), [
    { bookId: "a", pieceId: "p1" },
    { bookId: "a", pieceId: "p2" },
    { bookId: "b", pieceId: "p1" },
  ]);
  assert.equal(calls, 3, "logging what is already there writes nothing and tells no one");
  for (const e of JSON.parse(map.get(SOUNDTRACK_KEY)!)) assert.deepEqual(Object.keys(e).sort(), ["bookId", "pieceId"]);
  assert.equal(store.entries(), store.entries(), "the same array until it changes");
});

test("A9: the log survives a reload; a garbled one reads as empty", () => {
  const map = new Map<string, string>();
  createSoundtrackStore(mapKv(map)).log("a", ["p1"]);
  assert.deepEqual(createSoundtrackStore(mapKv(map)).entries(), [{ bookId: "a", pieceId: "p1" }]);
  map.set(SOUNDTRACK_KEY, "{nope");
  assert.deepEqual(createSoundtrackStore(mapKv(map)).entries(), []);
  map.set(SOUNDTRACK_KEY, JSON.stringify([{ bookId: "a", pieceId: "p1", at: 5 }, { bookId: 3 }, "x", { bookId: "a", pieceId: "p1" }]));
  assert.deepEqual(createSoundtrackStore(mapKv(map)).entries(), [{ bookId: "a", pieceId: "p1" }], "kept fields only, once");
});

test("A9: Clear empties the log in one call", () => {
  const map = new Map<string, string>();
  const store = createSoundtrackStore(mapKv(map));
  store.log("a", ["p1"]);
  store.log("b", ["p2"]);
  store.clear();
  assert.deepEqual(store.entries(), []);
  assert.equal(map.has(SOUNDTRACK_KEY), false);
});

test("removing a book drops its soundtrack entries and keeps the others'", () => {
  const map = new Map<string, string>();
  const kv = mapKv(map);
  const store = createSoundtrackStore(kv);
  store.log("a", ["p1"]);
  store.log("b", ["p2"]);
  createLibraryStore(kv).removeBook("a");
  assert.deepEqual(store.entries(), [{ bookId: "b", pieceId: "p2" }], "the store reads what the library wrote");
  createLibraryStore(kv).removeBook("b");
  assert.equal(map.has(SOUNDTRACK_KEY), false);
});

const book = (id: string, title: string): Pick<Book, "id" | "title" | "author"> => ({ id, title, author: `${title} Author` });
const scores = (...chapters: ChapterScore[]): BookScores => ({ jobId: "j", model: "m", version: "v", scoredAt: 1, costUsd: 0, chapters });

test("A9: the view groups pieces by book, in the shelf's order, each with its title and artist", () => {
  const entries = [
    { bookId: "a", pieceId: "p2" },
    { bookId: "b", pieceId: "p1" },
    { bookId: "a", pieceId: "p1" },
    { bookId: "gone", pieceId: "p1" },
    { bookId: "b", pieceId: "unknown" },
  ];
  const view = soundtrackView(entries, [book("b", "Second"), book("a", "First"), book("c", "Never played")], (id) =>
    id === "c" ? null : scores(score()),
  );
  assert.deepEqual(view, [
    { bookId: "b", title: "Second", author: "Second Author", pieces: [{ id: "p1", title: "Theme 1", artist: "Composer 1" }] },
    {
      bookId: "a",
      title: "First",
      author: "First Author",
      pieces: [
        { id: "p2", title: "Theme 2", artist: "Composer 2" },
        { id: "p1", title: "Theme 1", artist: "Composer 1" },
      ],
    },
  ]);
  assert.deepEqual(soundtrackView([], [book("a", "First")], () => null), []);
});
