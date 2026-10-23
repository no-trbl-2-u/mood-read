import assert from "node:assert/strict";
import { test } from "node:test";

import { createClock, IDLE_CLOCK, type ClockEvent, type ClockState } from "./clock.ts";

const at = (position: number, extra: Partial<ClockState> = {}): ClockState => ({
  bookId: "b1",
  position,
  playing: true,
  rate: 1,
  chapterIndex: 0,
  ...extra,
});

test("a late subscriber reads the current state", () => {
  const clock = createClock();
  assert.deepEqual(clock.current(), IDLE_CLOCK);
  clock.publish(at(5), "load");
  assert.equal(clock.current().position, 5);
});

test("subscribers hear every change with its event, until they unsubscribe", () => {
  const clock = createClock();
  const heard: [number, ClockEvent][] = [];
  const off = clock.subscribe((s, e) => heard.push([s.position, e]));
  clock.publish(at(1), "play");
  clock.publish(at(31), "seek");
  clock.publish(at(31, { rate: 2 }), "rate");
  off();
  clock.publish(at(40), "tick");
  assert.deepEqual(heard, [
    [1, "play"],
    [31, "seek"],
    [31, "rate"],
  ]);
});

test("a tick with nothing changed is dropped", () => {
  const clock = createClock();
  let count = 0;
  clock.subscribe(() => count++);
  clock.publish(at(2), "tick");
  clock.publish(at(2), "tick");
  assert.equal(count, 1);
});

test("a tick that crosses into another chapter is reported as a chapter change", () => {
  const clock = createClock();
  const events: ClockEvent[] = [];
  clock.publish(at(99, { chapterIndex: 0 }), "tick");
  clock.subscribe((_, e) => events.push(e));
  clock.publish(at(100.2, { chapterIndex: 1 }), "tick");
  clock.publish(at(0, { bookId: "b2", chapterIndex: 0 }), "load");
  assert.deepEqual(events, ["chapter", "load"]);
});
