import assert from "node:assert/strict";
import { test } from "node:test";

import { bookLengthLine, browseRowCaption, lengthLabel } from "./librivox-labels.ts";

test("lengthLabel reads hours and minutes longhand, drops the hours under one; null in, null out", () => {
  assert.equal(lengthLabel(3600 + 41 * 60), "1 h 41 min");
  assert.equal(lengthLabel(41 * 60), "41 min");
  assert.equal(lengthLabel(0), null);
  assert.equal(lengthLabel(null), null);
});

test("browseRowCaption adds the runtime when archive.org gave one, else just the author", () => {
  assert.equal(browseRowCaption("Lewis Carroll", "2:54:12"), "Lewis Carroll · 2 h 54 min");
  assert.equal(browseRowCaption("Lewis Carroll", null), "Lewis Carroll");
  assert.equal(browseRowCaption("Lewis Carroll", "not a length"), "Lewis Carroll");
});

test("bookLengthLine joins length, chapter count and size; the size is left out when unknown", () => {
  assert.equal(bookLengthLine(3 * 3600 + 41 * 60, 12, 168 * 1024 * 1024), "3 h 41 min · 12 chapters · 168 MB");
  assert.equal(bookLengthLine(3 * 3600 + 41 * 60, 1, null), "3 h 41 min · 1 chapter");
  assert.equal(bookLengthLine(null, 12, null), "12 chapters");
});
