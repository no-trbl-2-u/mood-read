import assert from "node:assert/strict";
import { test } from "node:test";

import { downloadCaption, downloadKindLabel } from "./download-labels.ts";
import type { Download } from "./types.ts";

function download(over: Partial<Download>): Download {
  return {
    id: "d",
    target: { kind: "book", bookId: "b" },
    state: "queued",
    bytes: 0,
    totalBytes: null,
    error: null,
    attempts: 0,
    queuedAt: 0,
    updatedAt: 0,
    ...over,
  };
}

test("a book and a piece read as their two words", () => {
  assert.equal(downloadKindLabel({ kind: "book", bookId: "b" }), "Book");
  assert.equal(downloadKindLabel({ kind: "piece", pieceId: "p" }), "Piece");
});

test("A6: a queued download's caption names its kind and that it is waiting", () => {
  assert.equal(downloadCaption(download({ state: "queued" })), "Book · queued");
});

test("A6: a running download's caption shows its percentage and bytes, once known", () => {
  assert.equal(downloadCaption(download({ state: "running", totalBytes: null })), "Book · downloading");
  assert.equal(
    downloadCaption(download({ target: { kind: "piece", pieceId: "p" }, state: "running", bytes: 412 * 1024, totalBytes: 664 * 1024 })),
    "Piece · 62% · 412 KB of 664 KB",
  );
  // A total that reports but reads as 0 (a bad Content-Length) does not divide by it.
  assert.equal(downloadCaption(download({ state: "running", bytes: 10, totalBytes: 0 })), "Book · downloading");
});

test("A6: a paused download keeps its last known bytes in its caption", () => {
  assert.equal(downloadCaption(download({ state: "paused", bytes: 10 * 1024 * 1024, totalBytes: 100 * 1024 * 1024 })), "Book · paused · 10 MB of 100 MB");
  assert.equal(downloadCaption(download({ state: "paused", totalBytes: null })), "Book · paused");
});

test("A6: a failed download's caption carries its error, when it has one", () => {
  assert.equal(downloadCaption(download({ state: "failed", error: "the connection dropped" })), "Book · failed: the connection dropped");
  assert.equal(downloadCaption(download({ state: "failed", error: null })), "Book · failed");
});

test("a finished download reads simply as downloaded", () => {
  assert.equal(downloadCaption(download({ state: "done" })), "Book · downloaded");
});
