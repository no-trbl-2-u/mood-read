import assert from "node:assert/strict";
import { test } from "node:test";

import type { Kv } from "./library-store.ts";
import { createVerdictStore, nextVerdict, verdictsKey } from "./verdict-store.ts";

function memoryKv(): Kv & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

let clock = 1000;
const now = () => (clock += 1);

test("A5: a verdict is kept per book and chapter on the device, and survives a reopen", () => {
  const kv = memoryKv();
  const store = createVerdictStore(kv, now);
  assert.equal(store.verdictFor("b1", 0, "p1"), null);
  store.setVerdict("b1", 0, "p1", "fits");
  store.setVerdict("b1", 1, "p2", "misfit");
  assert.equal(store.verdictFor("b1", 0, "p1"), "fits");
  assert.equal(store.verdictFor("b1", 1, "p2"), "misfit");
  // Another chapter, another piece, another book: nothing.
  assert.equal(store.verdictFor("b1", 1, "p1"), null);
  assert.equal(store.verdictFor("b2", 0, "p1"), null);
  assert.ok(kv.data.has(verdictsKey("b1")));
  assert.equal(kv.data.has(verdictsKey("b2")), false);

  const reopened = createVerdictStore(kv, now);
  assert.equal(reopened.verdictFor("b1", 0, "p1"), "fits");
  const rows = reopened.verdicts("b1");
  assert.deepEqual(
    rows.map(({ chapterIndex, pieceId, verdict }) => ({ chapterIndex, pieceId, verdict })),
    [
      { chapterIndex: 0, pieceId: "p1", verdict: "fits" },
      { chapterIndex: 1, pieceId: "p2", verdict: "misfit" },
    ],
  );
  assert.ok(rows.every((r) => Number.isFinite(r.at) && r.at > 1000));
});

test("A5: one verdict per chapter and piece: a new one replaces it, null clears it; another piece keeps its own", () => {
  const kv = memoryKv();
  const store = createVerdictStore(kv, now);
  store.setVerdict("b1", 0, "p1", "fits");
  store.setVerdict("b1", 0, "p1", "misfit");
  assert.equal(store.verdicts("b1").length, 1);
  assert.equal(store.verdictFor("b1", 0, "p1"), "misfit");
  // After "Doesn't fit" the listener picks an alternate and says it fits: both are kept.
  store.setVerdict("b1", 0, "p2", "fits");
  assert.equal(store.verdictFor("b1", 0, "p1"), "misfit");
  assert.equal(store.verdictFor("b1", 0, "p2"), "fits");
  store.setVerdict("b1", 0, "p1", null);
  assert.equal(store.verdictFor("b1", 0, "p1"), null);
  assert.equal(store.verdicts("b1").length, 1);
  store.setVerdict("b1", 0, "p2", null);
  assert.equal(kv.data.has(verdictsKey("b1")), false);
});

test("A5: tapping the lit target clears it; tapping the other switches", () => {
  assert.equal(nextVerdict(null, "fits"), "fits");
  assert.equal(nextVerdict(null, "misfit"), "misfit");
  assert.equal(nextVerdict("fits", "fits"), null);
  assert.equal(nextVerdict("misfit", "misfit"), null);
  assert.equal(nextVerdict("fits", "misfit"), "misfit");
  assert.equal(nextVerdict("misfit", "fits"), "fits");
});

test("A5: listeners hear a change, not a no-op; the snapshot is stable between changes", () => {
  const store = createVerdictStore(memoryKv(), now);
  let calls = 0;
  const off = store.subscribe(() => (calls += 1));
  const before = store.verdicts("b1");
  assert.equal(store.verdicts("b1"), before);
  store.setVerdict("b1", 0, "p1", "fits");
  store.setVerdict("b1", 0, "p1", "fits");
  store.setVerdict("b1", 2, "p1", null);
  assert.equal(calls, 1);
  const after = store.verdicts("b1");
  assert.notEqual(after, before);
  assert.equal(store.verdicts("b1"), after);
  off();
  store.setVerdict("b1", 0, "p1", "misfit");
  assert.equal(calls, 1);
});

test("A5: a damaged store reads as no verdicts, and malformed rows are dropped", () => {
  const kv = memoryKv();
  kv.setItem(verdictsKey("bad"), "{not json");
  kv.setItem(
    verdictsKey("mixed"),
    JSON.stringify([
      { chapterIndex: 0, pieceId: "p1", verdict: "fits", at: 5 },
      { chapterIndex: -1, pieceId: "p1", verdict: "fits", at: 5 },
      { chapterIndex: 1, pieceId: "", verdict: "fits", at: 5 },
      { chapterIndex: 2, pieceId: "p1", verdict: "maybe", at: 5 },
      { chapterIndex: 3, pieceId: "p1", verdict: "misfit" },
      null,
    ]),
  );
  const store = createVerdictStore(kv, now);
  assert.deepEqual(store.verdicts("bad"), []);
  assert.deepEqual(store.verdicts("mixed"), [{ chapterIndex: 0, pieceId: "p1", verdict: "fits", at: 5 }]);
});

test("A5: forgetting a book drops its verdicts", () => {
  const kv = memoryKv();
  const store = createVerdictStore(kv, now);
  store.setVerdict("b1", 0, "p1", "fits");
  store.forget("b1");
  assert.deepEqual(store.verdicts("b1"), []);
  assert.equal(kv.data.has(verdictsKey("b1")), false);
});

// A chapter edit moves chapters' places, so the verdicts, kept by chapter index, move with them (audit 4.0).
function withVerdicts() {
  const kv = memoryKv();
  const store = createVerdictStore(kv, now);
  store.setVerdict("b1", 0, "p0", "fits");
  store.setVerdict("b1", 1, "p1", "misfit");
  store.setVerdict("b1", 2, "p2", "fits");
  store.setVerdict("b1", 3, "p3", "misfit");
  return { kv, store };
}
const view = (store: ReturnType<typeof createVerdictStore>, id = "b1") =>
  store.verdicts(id).map(({ chapterIndex, pieceId, verdict }) => `${chapterIndex}:${pieceId}:${verdict}`);

test("4.0: merging chapter 1 with the next keeps its verdict, drops the second's and moves later ones down", () => {
  const { store } = withVerdicts();
  let told = 0;
  store.subscribe(() => told++);
  store.afterMerge("b1", 1);
  assert.deepEqual(view(store), ["0:p0:fits", "1:p1:misfit", "2:p3:misfit"]);
  assert.equal(store.verdictFor("b1", 3, "p3"), null);
  assert.equal(told, 1);
});

test("4.0: splitting chapter 1 keeps its verdict on the first half and moves later ones up", () => {
  const { store, kv } = withVerdicts();
  store.afterSplit("b1", 1);
  assert.deepEqual(view(store), ["0:p0:fits", "1:p1:misfit", "3:p2:fits", "4:p3:misfit"]);
  assert.deepEqual(
    createVerdictStore(kv, now).verdicts("b1").map((v) => v.chapterIndex),
    [0, 1, 3, 4],
  );
});

test("4.0: an edit leaves other books and an unmarked book alone and tells no one", () => {
  const { store, kv } = withVerdicts();
  store.setVerdict("b2", 2, "q", "fits");
  let told = 0;
  store.subscribe(() => told++);
  store.afterMerge("b3", 0);
  store.afterSplit("b3", 0);
  assert.equal(told, 0);
  assert.equal(kv.data.has(verdictsKey("b3")), false);
  store.afterMerge("b1", 3);
  assert.deepEqual(view(store, "b2"), ["2:q:fits"]);
  assert.deepEqual(view(store), ["0:p0:fits", "1:p1:misfit", "2:p2:fits", "3:p3:misfit"]);
});

test("4.0: a merge that drops the only verdict clears the book's key", () => {
  const kv = memoryKv();
  const store = createVerdictStore(kv, now);
  store.setVerdict("b1", 1, "p", "fits");
  store.afterMerge("b1", 0);
  assert.equal(store.verdicts("b1").length, 0);
  assert.equal(kv.data.has(verdictsKey("b1")), false);
});
