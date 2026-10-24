import assert from "node:assert/strict";
import { test } from "node:test";

import { createLibraryStore, type Kv } from "./library-store.ts";
import { createReachedStore, isReached, isSceneReached, reachedKey, REACH_STEP_S } from "./reached.ts";

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

// ---- The furthest place within the playing chapter (07.2, spec 07 A2) ----------------------------------------

const span = (start: number, end: number) => ({ start, end });

test("A2: a scene is reached once the clock has reached its start in that chapter, or the clock is in it", () => {
  assert.equal(isSceneReached(140, null, 120), false, "ahead of the clock, nothing recorded");
  assert.equal(isSceneReached(140, null, 140), true, "the clock at its start");
  assert.equal(isSceneReached(140, 150, 120), true, "reached before, the clock now back in an earlier scene");
  assert.equal(isSceneReached(160, 150, 120), false);
  assert.equal(isSceneReached(150.0000001, 150, null), true, "float noise at the boundary still counts");
});

test("A2: the store keeps the furthest place reached within the playing chapter; going back never lowers it", () => {
  const store = createReachedStore(mapKv());
  const c = span(100, 200);
  assert.equal(store.furthestIn("b", c), null);
  store.reachAt("b", c, 110);
  store.reachAt("b", c, 150);
  assert.equal(store.furthestIn("b", c), 150);
  store.reachAt("b", c, 105);
  assert.equal(store.furthestIn("b", c), 150, "a seek back keeps the furthest place");
  assert.equal(store.furthest("b"), 100, "reaching a place in a chapter reaches the chapter");
});

test("A2: moving to another chapter starts its own furthest place; the earlier chapter's is not kept", () => {
  const store = createReachedStore(mapKv());
  store.reachAt("b", span(0, 100), 80);
  store.reachAt("b", span(100, 200), 120);
  assert.equal(store.furthestIn("b", span(100, 200)), 120);
  assert.equal(store.furthestIn("b", span(0, 100)), null, "only the playing chapter's place is kept");
  assert.equal(store.furthest("b"), 100);
  // Back in the first chapter: its place starts again from where the clock is, and the furthest chapter stays.
  store.reachAt("b", span(0, 100), 10);
  assert.equal(store.furthestIn("b", span(0, 100)), 10);
  assert.equal(store.furthest("b"), 100);
});

test("A2: the place is written at most once per REACH_STEP_S of listening, and a place outside the chapter is ignored", () => {
  const map = new Map<string, string>();
  let writes = 0;
  const kv = mapKv(map);
  const store = createReachedStore({ ...kv, setItem: (k, v) => (writes++, kv.setItem(k, v)) });
  let calls = 0;
  store.subscribe(() => calls++);
  const c = span(0, 100);
  store.reachAt("b", c, 0);
  for (let t = 0.25; t < REACH_STEP_S; t += 0.25) store.reachAt("b", c, t);
  assert.equal(writes, 1, "ticks inside one step write nothing more");
  store.reachAt("b", c, REACH_STEP_S + 0.1);
  assert.equal(writes, 2);
  assert.equal(calls, 2);
  store.reachAt("b", c, 500);
  store.reachAt("b", c, Number.NaN);
  assert.equal(store.furthestIn("b", c), REACH_STEP_S + 0.1);
});

test("A2: the stored shape before 07.2 (a bare chapter start) still reads; the new shape survives a reload", () => {
  const map = new Map<string, string>([[reachedKey("old"), "300"]]);
  const store = createReachedStore(mapKv(map));
  assert.equal(store.furthest("old"), 300);
  assert.equal(store.furthestIn("old", span(300, 400)), null);
  store.reachAt("old", span(300, 400), 340);
  const again = createReachedStore(mapKv(map));
  assert.equal(again.furthest("old"), 300);
  assert.equal(again.furthestIn("old", span(300, 400)), 340);
  // A chapter-level reach keeps the place within the chapter.
  again.reach("old", ch(400));
  assert.equal(createReachedStore(mapKv(map)).furthest("old"), 400);
  assert.equal(createReachedStore(mapKv(map)).furthestIn("old", span(300, 400)), 340);
  // A garbled place reads as none, the chapter start kept.
  const broken = new Map<string, string>([[reachedKey("x"), JSON.stringify({ start: 50, chapter: { start: "a", position: 1 } })]]);
  const b = createReachedStore(mapKv(broken));
  assert.equal(b.furthest("x"), 50);
  assert.equal(b.furthestIn("x", span(0, 100)), null);
});
