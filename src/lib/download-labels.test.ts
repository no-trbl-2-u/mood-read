import assert from "node:assert/strict";
import { test } from "node:test";

import { downloadCaption, downloadKindLabel, playlistLine } from "./download-labels.ts";
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

test("A4: the playlist band says how many pieces and bytes are on the device, and when it is done", () => {
  const s = { done: 1, total: 3, bytes: 1_258_291, totalBytes: 4_718_592, failed: 0 };
  assert.equal(playlistLine({ ...s, state: "unbuilt" }), null);
  assert.equal(playlistLine({ ...s, state: "building" }), "Downloading music: 1 of 3 pieces · 1.2 MB of 4.5 MB");
  assert.equal(playlistLine({ ...s, state: "paused" }), "Music paused: 1 of 3 pieces");
  assert.equal(playlistLine({ ...s, state: "failed", failed: 2 }), "2 pieces didn't download: 1 of 3 pieces on this device");
  assert.equal(playlistLine({ ...s, state: "failed", failed: 1 }), "1 piece didn't download: 1 of 3 pieces on this device");
  assert.equal(playlistLine({ ...s, done: 3, bytes: 4_718_592, state: "done" }), "Playlist on this device: 3 pieces · 4.5 MB");
  assert.equal(playlistLine({ done: 1, total: 1, bytes: 10, totalBytes: 10, failed: 0, state: "done" }), "Playlist on this device: 1 piece · 10 B");
});
