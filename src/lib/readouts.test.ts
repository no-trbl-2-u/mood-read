import assert from "node:assert/strict";
import { test } from "node:test";

import { chapterClock, sleepReadout } from "./readouts.ts";

test("the chapter clock reads elapsed within the chapter and its length", () => {
  assert.deepEqual(chapterClock(100, 805, 285), { elapsed: "3:05", length: "11:45" });
});

test("the chapter clock keeps elapsed inside the chapter", () => {
  assert.deepEqual(chapterClock(100, 160, 90), { elapsed: "0:00", length: "1:00" });
  assert.deepEqual(chapterClock(100, 160, 175), { elapsed: "1:00", length: "1:00" });
});

test("a chapter of an hour or more reads hours", () => {
  assert.deepEqual(chapterClock(0, 3725, 3600), { elapsed: "1:00:00", length: "1:02:05" });
});

test("no sleep timer reads nothing", () => {
  assert.equal(sleepReadout(null, 0), null);
});

test("an end of chapter timer reads end of chapter", () => {
  assert.equal(sleepReadout({ kind: "chapterEnd", chapterIndex: 2, end: 900 }, 0), "Sleep · end of chapter");
});

test("a minutes timer reads whole minutes left, rounded up", () => {
  const timer = { kind: "minutes", minutes: 15, endsAt: 15 * 60_000 } as const;
  assert.equal(sleepReadout(timer, 0), "Sleep · 15 min");
  assert.equal(sleepReadout(timer, 1_000), "Sleep · 15 min");
  assert.equal(sleepReadout(timer, 60_000), "Sleep · 14 min");
});

test("a minutes timer in its last minute, or overdue, reads 1 min", () => {
  const timer = { kind: "minutes", minutes: 15, endsAt: 60_000 } as const;
  assert.equal(sleepReadout(timer, 30_000), "Sleep · 1 min");
  assert.equal(sleepReadout(timer, 90_000), "Sleep · 1 min");
});

test("a minutes timer read on a clock from before it was set reads no more than its minutes", () => {
  const timer = { kind: "minutes", minutes: 15, endsAt: 100_000 + 15 * 60_000 } as const;
  assert.equal(sleepReadout(timer, 99_000), "Sleep · 15 min");
});
