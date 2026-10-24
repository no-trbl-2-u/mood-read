import assert from "node:assert/strict";
import { test } from "node:test";

import { createLibraryStore, type Kv } from "./library-store.ts";
import { createReachedStore, isReached, reachedKey } from "./reached.ts";

function mapKv(map = new Map<string, string>()): Kv {
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const ch = (start: number) => ({ start });

test("A21: with nothing recorded, only the playing chapter is reached", () => {
  assert.equal(isReached(ch(0), null), false);
  assert.equal(isReached(ch(0), null, ch(0)), true);
  assert.equal(isReached(ch(100), null, ch(0)), false);
});

test("A21: a chapter is reached when its start is at or before the furthest point playback has entered", () => {
  assert.equal(isReached(ch(0), 200), true);
  assert.equal(isReached(ch(200), 200), true);
  assert.equal(isReached(ch(200.0000001), 200), true, "float noise at the boundary still counts");
  assert.equal(isReached(ch(300), 200), false);
  assert.equal(isReached(ch(300), 200, ch(300)), true, "the playing chapter is reached before the store catches up");
});

test("the furthest point only moves forward: going back never un-reaches a chapter", () => {
  const store = createReachedStore(mapKv());
  let calls = 0;
  store.subscribe(() => calls++);
  assert.equal(store.furthest("b"), null);
  store.reach("b", ch(0));
  store.reach("b", ch(300));
  assert.equal(store.furthest("b"), 300);
  store.reach("b", ch(100));
  assert.equal(store.furthest("b"), 300);
  assert.equal(calls, 2, "a backward jump writes nothing");
  assert.equal(isReached(ch(300), store.furthest("b"), ch(100)), true);
});

test("jumping ahead reaches the chapter jumped to and every one before it, not the ones after", () => {
  const store = createReachedStore(mapKv());
  store.reach("b", ch(0));
  store.reach("b", ch(500)); // the listener tapped chapter 6
  for (const s of [0, 100, 200, 500]) assert.equal(isReached(ch(s), store.furthest("b")), true, `start ${s}`);
  assert.equal(isReached(ch(600), store.furthest("b")), false);
});

test("what was reached survives a reload, per book", () => {
  const map = new Map<string, string>();
  createReachedStore(mapKv(map)).reach("b", ch(250));
  const again = createReachedStore(mapKv(map));
  assert.equal(again.furthest("b"), 250);
  assert.equal(again.furthest("other"), null);
});

test("a garbled or negative stored value reads as nothing recorded; bad input is ignored", () => {
  const map = new Map<string, string>([[reachedKey("b"), "{nope"], [reachedKey("c"), "-5"]]);
  const store = createReachedStore(mapKv(map));
  assert.equal(store.furthest("b"), null);
  assert.equal(store.furthest("c"), null);
  store.reach("d", ch(Number.NaN));
  assert.equal(store.furthest("d"), null);
});

test("removing a book forgets what it reached", () => {
  const map = new Map<string, string>();
  const kv = mapKv(map);
  createReachedStore(kv).reach("b", ch(10));
  const lib = createLibraryStore(kv);
  lib.removeBook("b");
  assert.equal(map.has(reachedKey("b")), false);
});
