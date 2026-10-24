import assert from "node:assert/strict";
import { test } from "node:test";

import { formatBytes, musicBytesFrom } from "./storage.ts";
import type { Download } from "./types.ts";

test("formatBytes reads in the smallest sensible unit, one decimal under 10", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(664 * 1024 * 1024), "664 MB");
  assert.equal(formatBytes(1.2 * 1024 ** 3), "1.2 GB");
  assert.equal(formatBytes(-5), "0 B");
  assert.equal(formatBytes(NaN), "0 B");
});

function download(over: Partial<Download>): Download {
  return {
    id: "d",
    target: { kind: "book", bookId: "b" },
    state: "done",
    bytes: 0,
    totalBytes: null,
    error: null,
    attempts: 0,
    queuedAt: 0,
    updatedAt: 0,
    ...over,
  };
}

test("A6: music's bytes are the finished pieces' bytes, apart from books; 0 with none (no catalog yet)", () => {
  assert.equal(musicBytesFrom([]), 0);
  assert.equal(
    musicBytesFrom([
      download({ target: { kind: "book", bookId: "b1" }, state: "done", bytes: 5_000_000 }),
      download({ target: { kind: "piece", pieceId: "p1" }, state: "running", bytes: 1_000 }),
    ]),
    0,
  );
  assert.equal(
    musicBytesFrom([
      download({ target: { kind: "piece", pieceId: "p1" }, state: "done", bytes: 2_000_000 }),
      download({ target: { kind: "piece", pieceId: "p2" }, state: "done", bytes: 3_000_000 }),
      download({ target: { kind: "book", bookId: "b1" }, state: "done", bytes: 9_000_000 }),
    ]),
    5_000_000,
  );
});
