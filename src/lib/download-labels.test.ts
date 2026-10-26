import assert from "node:assert/strict";
import { test } from "node:test";

import { downloadCaption, downloadKindLabel, downloadProgressView, playlistLine } from "./download-labels.ts";
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
  assert.equal(downloadCaption(download({ state: "running", bytes: 10, totalBytes: 0 })), "Book · downloading · 10 B so far");
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

test("A25: a running download with an unknown total reads Downloading with the bytes so far, on a moving bar", () => {
  const v = downloadProgressView(download({ state: "running", bytes: 3 * 1024 * 1024, totalBytes: null }));
  assert.equal(v.title, "Downloading");
  assert.equal(v.detail, "3.0 MB so far");
  assert.equal(v.indeterminate, true);
  assert.equal(v.fraction, null);
});

test("A25: a running download that has moved nothing yet says Downloading, not Queued, with no byte line", () => {
  const v = downloadProgressView(download({ state: "running", bytes: 0, totalBytes: null }));
  assert.equal(v.title, "Downloading");
  assert.equal(v.detail, null);
  assert.equal(v.indeterminate, true);
});

test("A25: Queued is only for a queued download, and its bar is empty", () => {
  const v = downloadProgressView(download({ state: "queued" }));
  assert.equal(v.title, "Queued to download…");
  assert.equal(v.indeterminate, false);
  assert.equal(v.fraction, 0);
});

test("A25: a running download with a known total shows its percent, bytes and a proportional bar", () => {
  const v = downloadProgressView(download({ state: "running", bytes: 512 * 1024, totalBytes: 2 * 1024 * 1024 }));
  assert.equal(v.title, "Downloading 25%");
  assert.equal(v.detail, "512 KB of 2.0 MB");
  assert.equal(v.fraction, 0.25);
  assert.equal(v.indeterminate, false);
});

test("A25: a paused download reads Paused and keeps what it had; a bar never passes full", () => {
  const p = downloadProgressView(download({ state: "paused", bytes: 1024, totalBytes: 4096 }));
  assert.equal(p.title, "Paused");
  assert.equal(p.fraction, 0.25);
  assert.equal(downloadProgressView(download({ state: "running", bytes: 9000, totalBytes: 4096 })).fraction, 1);
});

test("A25: the Downloads row of a running download with an unknown total shows the bytes so far", () => {
  assert.equal(downloadCaption(download({ state: "running", bytes: 2048 })), "Book · downloading · 2.0 KB so far");
  assert.equal(downloadCaption(download({ state: "running", bytes: 0 })), "Book · downloading");
});
