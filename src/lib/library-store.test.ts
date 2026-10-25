import assert from "node:assert/strict";
import { test } from "node:test";

import { bedsAfterMerge, bedsAfterSplit, defaultBedFor, pickLayer, setChapterOnly } from "./bed.ts";
import { DEFAULT_MIX } from "./mix.ts";
import { createLibraryStore, sortBooks, type Kv } from "./library-store.ts";
import type { Book } from "./types.ts";

function memoryKv(): Kv & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function book(id: string, title: string, lastPlayedAt: number | null = null): Book {
  return {
    id,
    title,
    author: "Unknown author",
    narrator: "",
    cover: null,
    files: [{ ref: `idb:${id}/0`, name: `${title}.wav`, duration: 100 }],
    chapters: [{ bookId: id, index: 0, title: "Chapter 1", fileIndex: 0, start: 0, end: 100 }],
    duration: 100,
    addedAt: 1,
    lastPlayedAt,
    source: { kind: "import" },
    onDevice: true,
  };
}

let clock = 1000;
const tick = () => ++clock;
let ids = 0;
const nextId = () => `m${++ids}`;

test("a saved position survives closing and reopening the app (a new store over the same storage)", () => {
  const kv = memoryKv();
  const first = createLibraryStore(kv);
  first.addBook(book("b1", "Dune"));
  first.savePosition("b1", 87.51);
  const reopened = createLibraryStore(kv);
  assert.equal(reopened.getBook("b1")?.title, "Dune");
  assert.equal(reopened.getPosition("b1"), 87.51);
});

test("positions default to zero and ignore bad values", () => {
  const kv = memoryKv();
  const store = createLibraryStore(kv);
  assert.equal(store.getPosition("nope"), 0);
  store.savePosition("b1", -4);
  assert.equal(store.getPosition("b1"), 0);
  store.savePosition("b1", 12);
  store.savePosition("b1", Number.NaN);
  assert.equal(store.getPosition("b1"), 12);
  kv.setItem("pos:b2", "not json");
  assert.equal(store.getPosition("b2"), 0);
});

test("speed is saved per book and kept within 0.5x to 3x", () => {
  const kv = memoryKv();
  const store = createLibraryStore(kv);
  assert.equal(store.getSpeed("b1"), 1);
  store.saveSpeed("b1", 1.5);
  store.saveSpeed("b2", 9);
  assert.equal(createLibraryStore(kv).getSpeed("b1"), 1.5);
  assert.equal(store.getSpeed("b2"), 3);
});

test("A10: the mix is saved per book, restored on reopen, and a broken one falls back to the default", () => {
  const kv = memoryKv();
  const store = createLibraryStore(kv);
  assert.deepEqual(store.getMix("b1"), DEFAULT_MIX);
  store.saveMix("b1", { ...DEFAULT_MIX, balance: 0.2, master: 0.7, duck: true });
  store.saveMix("b2", { ...DEFAULT_MIX, balance: -9, master: 4, duck: false });
  assert.deepEqual(createLibraryStore(kv).getMix("b1"), { ...DEFAULT_MIX, balance: 0.2, master: 0.7, duck: true });
  assert.deepEqual(store.getMix("b2"), { ...DEFAULT_MIX, balance: -1, master: 1, duck: false });
  kv.setItem("mix:b3", "not json");
  assert.deepEqual(store.getMix("b3"), DEFAULT_MIX);
});

test("bookmarks are added, named, sorted by position, jumped to and kept across a reopen", () => {
  const kv = memoryKv();
  const store = createLibraryStore(kv, tick, nextId);
  const late = store.addBookmark("b1", 40, "  The storm  ");
  const early = store.addBookmark("b1", 10, "");
  assert.deepEqual(
    store.bookmarks("b1").map((m) => [m.position, m.name]),
    [
      [10, ""],
      [40, "The storm"],
    ],
  );
  store.renameBookmark("b1", early.id, "Arrival");
  store.renameBookmark("b1", late.id, "   ");
  const reopened = createLibraryStore(kv, tick, nextId);
  assert.deepEqual(
    reopened.bookmarks("b1").map((m) => [m.position, m.name]),
    [
      [10, "Arrival"],
      [40, "The storm"],
    ],
  );
  reopened.deleteBookmark("b1", early.id);
  assert.deepEqual(
    reopened.bookmarks("b1").map((m) => m.id),
    [late.id],
  );
  assert.deepEqual(store.bookmarks("b2"), []);
});

test("listeners hear changes and stop hearing them after unsubscribing", () => {
  const store = createLibraryStore(memoryKv());
  let heard = 0;
  const off = store.subscribe(() => heard++);
  store.addBook(book("b1", "Dune"));
  store.addBookmark("b1", 5, "x");
  assert.equal(heard, 2);
  off();
  store.addBook(book("b2", "Emma"));
  assert.equal(heard, 2);
});

test("the snapshot is stable between changes (useSyncExternalStore needs that)", () => {
  const store = createLibraryStore(memoryKv());
  store.addBook(book("b1", "Dune"));
  assert.equal(store.books(), store.books());
  store.bookmarks("b1");
  assert.equal(store.bookmarks("b1"), store.bookmarks("b1"));
});

test("A12: the layer is saved per book with any chapter's own; a mix saved before 01.7 plays the default", () => {
  const kv = memoryKv();
  const store = createLibraryStore(kv);
  assert.equal(store.getMix("b1").soundscapeId, "night-wind");
  let mix = { ...store.getMix("b1"), ...pickLayer(store.getMix("b1"), 0, "rain") };
  mix = { ...mix, ...pickLayer(setChapterOnly(mix, 1, true), 1, "off") };
  store.saveMix("b1", mix);
  const back = createLibraryStore(kv).getMix("b1");
  assert.equal(back.soundscapeId, "rain");
  assert.deepEqual(back.chapterBeds, { "1": { layer: "off", soundscapeId: null } });
  assert.equal(store.getMix("b2").soundscapeId, "night-wind", "another book keeps its own");
  kv.setItem("mix:b3", JSON.stringify({ balance: 0.1, master: 0.9, duck: true }));
  assert.deepEqual(store.getMix("b3"), { ...DEFAULT_MIX, balance: 0.1, master: 0.9, duck: true });
  kv.setItem("mix:b4", JSON.stringify({ ...DEFAULT_MIX, layer: "loud", chapterBeds: "x" }));
  assert.deepEqual(store.getMix("b4"), DEFAULT_MIX);
});

test("removing a book drops its position, speed, mix, bookmarks and verdicts", () => {
  const kv = memoryKv();
  const store = createLibraryStore(kv);
  store.addBook(book("b1", "Dune"));
  store.savePosition("b1", 3);
  store.saveSpeed("b1", 2);
  store.saveMix("b1", { ...DEFAULT_MIX, balance: 0, master: 0.5, duck: true });
  store.addBookmark("b1", 3, "a");
  kv.setItem("verdicts:b1", JSON.stringify([{ chapterIndex: 0, pieceId: "p1", verdict: "fits", at: 1 }]));
  store.removeBook("b1");
  assert.equal(store.getBook("b1"), undefined);
  assert.equal(kv.data.has("pos:b1"), false);
  assert.equal(kv.data.has("speed:b1"), false);
  assert.equal(kv.data.has("mix:b1"), false);
  assert.equal(kv.data.has("bookmarks:b1"), false);
  assert.equal(kv.data.has("verdicts:b1"), false);
  assert.deepEqual(store.bookmarks("b1"), []);
});

test("the library sorts most recently played first, then by title", () => {
  const sorted = sortBooks([book("a", "Walden"), book("b", "Dune", 5), book("c", "Emma"), book("d", "Ivanhoe", 9)]);
  assert.deepEqual(
    sorted.map((b) => b.title),
    ["Ivanhoe", "Dune", "Emma", "Walden"],
  );
  const store = createLibraryStore(memoryKv(), tick);
  store.addBook(book("a", "Walden"));
  store.addBook(book("b", "Dune"));
  store.markPlayed("a");
  assert.equal(store.books()[0].id, "a");
  store.markPlayed("missing");
  assert.equal(store.books().length, 2);
});

test("A6 edited chapters are saved for the book and kept across a reopen; a list with a gap is refused", () => {
  const kv = memoryKv();
  const store = createLibraryStore(kv);
  store.addBook(book("b1", "Dune"));
  const split = [
    { bookId: "b1", index: 0, title: "Arrival", fileIndex: 0, start: 0, end: 40 },
    { bookId: "b1", index: 1, title: "Arrival, part 2", fileIndex: 0, start: 40, end: 100 },
  ];
  store.setChapters("b1", split);
  assert.deepEqual(createLibraryStore(kv).getBook("b1")?.chapters, split);
  store.setChapters("b1", [{ ...split[0], end: 30 }, split[1]]);
  store.setChapters("b1", [split[0]]);
  store.setChapters("b1", []);
  assert.deepEqual(store.getBook("b1")?.chapters, split);
});

test("A32: a chapter edit moves the chapters' own beds in the same save; a refused edit or an unmixed book keeps its mix", () => {
  const kv = memoryKv();
  const store = createLibraryStore(kv);
  store.addBook(book("b1", "Dune"));
  const two = [
    { bookId: "b1", index: 0, title: "Arrival", fileIndex: 0, start: 0, end: 40 },
    { bookId: "b1", index: 1, title: "Desert", fileIndex: 0, start: 40, end: 100 },
  ];
  store.setChapters("b1", two);
  store.saveMix("b1", { ...DEFAULT_MIX, balance: 0.2, chapterBeds: { "1": { layer: "off", soundscapeId: null } } });
  // Split chapter 0 at 20: Desert is now chapter 2 and keeps its own.
  const three = [{ ...two[0], end: 20 }, { ...two[0], index: 1, title: "Arrival, part 2", start: 20 }, { ...two[1], index: 2 }];
  store.setChapters("b1", three, (beds) => bedsAfterSplit(beds, 0));
  const back = createLibraryStore(kv).getMix("b1");
  assert.deepEqual(back.chapterBeds, { "2": { layer: "off", soundscapeId: null } });
  assert.equal(back.balance, 0.2, "the rest of the mix is untouched");
  // A refused list (a gap) moves nothing.
  store.setChapters("b1", [three[0], three[2]], (beds) => bedsAfterMerge(beds, 0));
  assert.deepEqual(store.getMix("b1").chapterBeds, { "2": { layer: "off", soundscapeId: null } });
  // A book never mixed is not given a mix by an edit (it keeps following the default soundscape setting).
  store.addBook(book("b2", "Emma"));
  store.setChapters("b2", [{ ...book("b2", "Emma").chapters[0], end: 100 }], (beds) => bedsAfterMerge(beds, 0));
  assert.equal(kv.data.has("mix:b2"), false);
});

test("06.3: a book never mixed opens on the default soundscape setting; a book's saved layer keeps its own", () => {
  const kv = memoryKv();
  const store = createLibraryStore(kv);
  const tide = defaultBedFor("tide");
  assert.equal(store.getMix("new", tide).soundscapeId, "tide");
  assert.equal(store.getMix("new", defaultBedFor("off")).layer, "off");
  assert.deepEqual(store.getMix("new", defaultBedFor(null)), DEFAULT_MIX);
  store.saveMix("mine", { ...DEFAULT_MIX, ...pickLayer(DEFAULT_MIX, 0, "rain") });
  assert.equal(store.getMix("mine", tide).soundscapeId, "rain");
  assert.equal(store.getMix("mine", defaultBedFor("off")).layer, "soundscape");
});

test("a book is marked finished or not, keeping its place", () => {
  const kv = memoryKv();
  const store = createLibraryStore(kv, tick);
  store.addBook(book("a", "Walden"));
  store.savePosition("a", 40);
  store.setFinished("a", true);
  assert.equal(store.getBook("a")?.finished, true);
  assert.equal(store.getPosition("a"), 40);
  assert.equal(createLibraryStore(kv, tick).getBook("a")?.finished, true);
  store.setFinished("a", false);
  assert.equal(store.getBook("a")?.finished, false);
  store.setFinished("missing", true);
  assert.equal(store.books().length, 1);
});
