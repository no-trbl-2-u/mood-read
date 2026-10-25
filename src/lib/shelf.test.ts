import assert from "node:assert/strict";
import { test } from "node:test";

import { bookState, filterShelf, searchShelf, showSearch, sortShelf } from "./shelf.ts";
import type { Book } from "./types.ts";

function book(id: string, title: string, author: string, extra: Partial<Book> = {}): Book {
  return {
    id,
    title,
    author,
    narrator: "",
    cover: null,
    files: [],
    chapters: [],
    duration: 400,
    addedAt: 0,
    lastPlayedAt: null,
    source: { kind: "import" },
    onDevice: true,
    ...extra,
  };
}

test("a book is not started, in progress, or finished", () => {
  const b = book("a", "A", "X");
  assert.equal(bookState(b, 0), "not-started");
  assert.equal(bookState(b, 120), "in-progress");
  assert.equal(bookState(b, 400), "finished");
  assert.equal(bookState({ ...b, finished: true }, 0), "finished");
});

test("the shelf sorts by recent, title or author", () => {
  const books = [book("a", "Walden", "Thoreau", { lastPlayedAt: 1 }), book("b", "Dune", "Herbert", { lastPlayedAt: 9 }), book("c", "Emma", "Austen")];
  assert.deepEqual(sortShelf(books, "recent").map((b) => b.id), ["b", "a", "c"]);
  assert.deepEqual(sortShelf(books, "title").map((b) => b.id), ["b", "c", "a"]);
  assert.deepEqual(sortShelf(books, "author").map((b) => b.id), ["c", "b", "a"]);
});

test("a tie on author falls to title", () => {
  const books = [book("a", "Persuasion", "Austen"), book("b", "Emma", "Austen")];
  assert.deepEqual(sortShelf(books, "author").map((b) => b.id), ["b", "a"]);
});

test("the state filter keeps one state", () => {
  const books = [book("a", "A", "X"), book("b", "B", "X"), book("c", "C", "X", { finished: true })];
  const pos: Record<string, number> = { a: 0, b: 50, c: 10 };
  const at = (id: string) => pos[id];
  assert.equal(filterShelf(books, "all", at).length, 3);
  assert.deepEqual(filterShelf(books, "not-started", at).map((b) => b.id), ["a"]);
  assert.deepEqual(filterShelf(books, "in-progress", at).map((b) => b.id), ["b"]);
  assert.deepEqual(filterShelf(books, "finished", at).map((b) => b.id), ["c"]);
});

test("search matches every word across title, author and narrator", () => {
  const books = [book("a", "Pride and Prejudice", "Jane Austen", { narrator: "Karen Savage" }), book("b", "Dune", "Frank Herbert")];
  assert.deepEqual(searchShelf(books, "austen pride").map((b) => b.id), ["a"]);
  assert.deepEqual(searchShelf(books, "SAVAGE").map((b) => b.id), ["a"]);
  assert.equal(searchShelf(books, "  ").length, 2);
  assert.equal(searchShelf(books, "zzz").length, 0);
});

test("the search field shows only past ten books", () => {
  assert.equal(showSearch(10), false);
  assert.equal(showSearch(11), true);
});
