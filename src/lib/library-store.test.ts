import assert from "node:assert/strict";
import { test } from "node:test";

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

test("removing a book drops its position, speed and bookmarks", () => {
  const kv = memoryKv();
  const store = createLibraryStore(kv);
  store.addBook(book("b1", "Dune"));
  store.savePosition("b1", 3);
  store.saveSpeed("b1", 2);
  store.addBookmark("b1", 3, "a");
  store.removeBook("b1");
  assert.equal(store.getBook("b1"), undefined);
  assert.equal(kv.data.has("pos:b1"), false);
  assert.equal(kv.data.has("speed:b1"), false);
  assert.equal(kv.data.has("bookmarks:b1"), false);
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
