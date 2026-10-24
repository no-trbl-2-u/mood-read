import assert from "node:assert/strict";
import { test } from "node:test";

import { bookKey, isJobId, LIMITS, parseBookRequest } from "./validate.ts";

const book = { title: "The Hobbit", author: "J. R. R. Tolkien", chapters: ["An Unexpected Party", "Roast Mutton"] };

test("a body of exactly title, author and chapter titles is accepted, trimmed and whitespace-collapsed", () => {
  const r = parseBookRequest({ title: "  The  Hobbit ", author: "J. R. R. Tolkien", chapters: [" An Unexpected   Party", "Roast Mutton"] });
  assert.deepEqual(r, { ok: true, book });
});

test("an empty author is allowed (untagged files), an empty title is not", () => {
  assert.equal(parseBookRequest({ ...book, author: "" }).ok, true);
  assert.equal(parseBookRequest({ ...book, title: "  " }).ok, false);
});

test("any field besides title, author and chapters is refused, never ignored (A22)", () => {
  for (const extra of [{ deviceId: "abc" }, { position: 120 }, { audio: "UklGRg==" }, { rescore: true }, { email: "x@y.z" }]) {
    const r = parseBookRequest({ ...book, ...extra });
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /only title, author and chapters/);
  }
});

test("wrong shapes are refused", () => {
  for (const body of [null, [], "x", 3, { ...book, chapters: [] }, { ...book, chapters: "one" }, { ...book, chapters: [1] }, { ...book, chapters: ["  "] }, { title: "x", chapters: ["a"] }, { ...book, author: 5 }]) {
    assert.equal(parseBookRequest(body).ok, false, JSON.stringify(body));
  }
});

test("lengths are capped", () => {
  assert.equal(parseBookRequest({ ...book, title: "x".repeat(LIMITS.title + 1) }).ok, false);
  assert.equal(parseBookRequest({ ...book, chapters: Array.from({ length: LIMITS.chapters + 1 }, (_, i) => `c${i}`) }).ok, false);
  assert.equal(parseBookRequest({ ...book, chapters: ["y".repeat(LIMITS.chapterTitle + 1)] }).ok, false);
});

test("the book key is a stable hash of the book, the same for any listener, ignoring case and spacing", async () => {
  const a = await bookKey(book);
  const b = await bookKey({ title: "the hobbit", author: "j. r. r.  tolkien", chapters: ["AN UNEXPECTED PARTY", "Roast  Mutton"] });
  assert.equal(a, b);
  assert.ok(isJobId(a));
  assert.notEqual(a, await bookKey({ ...book, chapters: ["Roast Mutton", "An Unexpected Party"] }));
  assert.notEqual(a, await bookKey({ ...book, author: "Someone Else" }));
});

test("job ids are 64 hex characters, nothing else", () => {
  assert.equal(isJobId("a".repeat(64)), true);
  assert.equal(isJobId("A".repeat(64)), false);
  assert.equal(isJobId("../etc"), false);
});
