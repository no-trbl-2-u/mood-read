import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BED_RATE,
  bedOffset,
  bedSoundFor,
  crossfadeGains,
  CROSSFADE_MS,
  DEFAULT_BED,
  IDLE_BED,
  planBed,
  type BedContext,
  type BedState,
} from "./bed.ts";
import { createClock, type ClockEvent, type ClockState } from "./clock.ts";

const CATALOG = ["hum", "drift"] as const;
// Two chapters: 0 to 100 s and 100 to 220 s; both loops 4 s long.
const STARTS = [0, 100];
const ctxAt = (clock: ClockState): BedContext => ({
  chapterStart: STARTS[clock.chapterIndex ?? 0] ?? 0,
  soundFor: (i) => bedSoundFor(i, DEFAULT_BED, CATALOG),
  loopSeconds: () => 4,
});
const at = (position: number, extra: Partial<ClockState> = {}): ClockState => ({
  bookId: "b1",
  position,
  playing: true,
  rate: 1,
  chapterIndex: position >= 100 ? 1 : 0,
  ...extra,
});
const step = (prev: BedState, clock: ClockState, event: ClockEvent) => planBed(prev, clock, event, ctxAt(clock));

test("each chapter takes the catalog in turn; a book-wide soundscape wins; off and music play nothing", () => {
  assert.equal(bedSoundFor(0, DEFAULT_BED, CATALOG), "hum");
  assert.equal(bedSoundFor(1, DEFAULT_BED, CATALOG), "drift");
  assert.equal(bedSoundFor(2, DEFAULT_BED, CATALOG), "hum");
  assert.equal(bedSoundFor(3, { layer: "soundscape", soundscapeId: "hum" }, CATALOG), "hum");
  assert.equal(bedSoundFor(1, { layer: "soundscape", soundscapeId: "gone" }, CATALOG), "drift");
  assert.equal(bedSoundFor(0, { layer: "off", soundscapeId: null }, CATALOG), null);
  assert.equal(bedSoundFor(0, { layer: "music", soundscapeId: null }, CATALOG), null);
  assert.equal(bedSoundFor(null, DEFAULT_BED, CATALOG), null);
  assert.equal(bedSoundFor(0, DEFAULT_BED, []), null);
});

test("the loop offset is the time into the chapter, wrapped by the loop's length", () => {
  assert.equal(bedOffset(0, 0, 4), 0);
  assert.equal(bedOffset(9, 0, 4), 1);
  assert.equal(bedOffset(105.5, 100, 4), 1.5);
  assert.equal(bedOffset(99, 100, 4), 0);
  assert.equal(bedOffset(10, 0, 0), 0);
  assert.equal(bedOffset(Number.NaN, 0, 4), 0);
});

test("the crossfade is equal-power: in rises 0 to 1 as out falls 1 to 0, and their powers sum to 1", () => {
  assert.deepEqual(crossfadeGains(0), { in: 0, out: 1 });
  assert.deepEqual(crossfadeGains(CROSSFADE_MS), { in: 1, out: 0 });
  assert.deepEqual(crossfadeGains(CROSSFADE_MS * 3), { in: 1, out: 0 });
  assert.deepEqual(crossfadeGains(-50), { in: 0, out: 1 });
  let last = -1;
  for (let ms = 0; ms <= CROSSFADE_MS; ms += 100) {
    const g = crossfadeGains(ms);
    assert.ok(g.in >= last, "in never falls");
    last = g.in;
    assert.ok(Math.abs(g.in * g.in + g.out * g.out - 1) < 1e-5);
  }
  assert.deepEqual(crossfadeGains(10, 0), { in: 1, out: 0 });
});

test("A8: opening a book loads its chapter's sound at the right place, paused", () => {
  const r = step(IDLE_BED, at(9, { playing: false }), "load");
  assert.deepEqual(r.state, { soundId: "hum", playing: false });
  assert.deepEqual(r.commands, [{ type: "change", to: "hum", offset: 1, play: false, fade: false }]);
});

test("A8: the bed plays and pauses with the narration", () => {
  const loaded: BedState = { soundId: "hum", playing: false };
  const played = step(loaded, at(9), "play");
  assert.deepEqual(played.commands, [{ type: "play" }]);
  assert.deepEqual(played.state, { soundId: "hum", playing: true });
  const paused = step(played.state, at(12, { playing: false }), "pause");
  assert.deepEqual(paused.commands, [{ type: "pause" }]);
  // A plain tick changes nothing.
  assert.deepEqual(step(played.state, at(10), "tick").commands, []);
});

test("A8: a seek inside the chapter moves the bed within its loop", () => {
  const r = step({ soundId: "hum", playing: true }, at(30), "seek");
  assert.deepEqual(r.commands, [{ type: "seek", offset: 2 }]);
  const paused = step({ soundId: "hum", playing: false }, at(31, { playing: false }), "seek");
  assert.deepEqual(paused.commands, [{ type: "seek", offset: 3 }]);
});

test("A8: crossing a chapter boundary while playing crossfades to the next chapter's sound", () => {
  const r = step({ soundId: "hum", playing: true }, at(100.2), "chapter");
  assert.deepEqual(r.state, { soundId: "drift", playing: true });
  assert.equal(r.commands.length, 1);
  const c = r.commands[0];
  assert.equal(c.type, "change");
  if (c.type !== "change") return;
  assert.equal(c.to, "drift");
  assert.equal(c.fade, true);
  assert.equal(c.play, true);
  assert.ok(Math.abs(c.offset - 0.2) < 1e-9);
});

test("A8: a seek or jump into another chapter changes the sound, fading only if it is heard", () => {
  const playing = step({ soundId: "hum", playing: true }, at(100), "seek");
  assert.deepEqual(playing.commands, [{ type: "change", to: "drift", offset: 0, play: true, fade: true }]);
  const paused = step({ soundId: "drift", playing: false }, at(4, { playing: false }), "seek");
  assert.deepEqual(paused.commands, [{ type: "change", to: "hum", offset: 0, play: false, fade: false }]);
  // A jump from a paused bed starts the new sound with no fade.
  const jump = step({ soundId: "hum", playing: false }, at(100), "seek");
  assert.deepEqual(jump.commands, [{ type: "change", to: "drift", offset: 0, play: true, fade: false }]);
});

test("A8: the same sound across a boundary keeps looping, untouched", () => {
  const ctx: BedContext = { chapterStart: 100, soundFor: () => "hum", loopSeconds: () => 4 };
  const r = planBed({ soundId: "hum", playing: true }, at(100.2), "chapter", ctx);
  assert.deepEqual(r.commands, []);
});

test("A8: closing the book or turning the layer off fades the bed out", () => {
  const closed = step({ soundId: "hum", playing: true }, at(0, { bookId: null, chapterIndex: null }), "stop");
  assert.deepEqual(closed.commands, [{ type: "change", to: null, offset: 0, play: false, fade: true }]);
  assert.deepEqual(closed.state, IDLE_BED);
});

test("A9: a change of narration speed never touches the bed, and no command carries a rate", () => {
  let state: BedState = { soundId: "hum", playing: true };
  for (const rate of [0.5, 1.5, 2, 3]) {
    const r = step(state, at(20, { rate }), "rate");
    assert.deepEqual(r.commands, []);
    state = r.state;
  }
  // The same moves at 3x give the same commands as at 1x.
  for (const [pos, ev] of [
    [30, "seek"],
    [100.1, "chapter"],
    [12, "pause"],
  ] as const) {
    const slow = step({ soundId: "hum", playing: true }, at(pos, { playing: ev !== "pause" }), ev);
    const fast = step({ soundId: "hum", playing: true }, at(pos, { playing: ev !== "pause", rate: 3 }), ev);
    assert.deepEqual(fast, slow);
    for (const c of fast.commands) assert.ok(!("rate" in c));
  }
  assert.equal(BED_RATE, 1);
});

test("the bed follows a real clock and never publishes to it", () => {
  const clock = createClock();
  let state: BedState = IDLE_BED;
  const log: string[] = [];
  clock.subscribe((s, e) => {
    const r = step(state, s, e);
    state = r.state;
    for (const c of r.commands) log.push(c.type === "change" ? `change:${c.to}:${c.fade}` : c.type);
  });
  clock.publish(at(0, { playing: false }), "load");
  clock.publish(at(0), "play");
  clock.publish(at(99.8), "tick");
  clock.publish(at(100.1), "tick");
  clock.publish(at(100.1, { rate: 2 }), "rate");
  clock.publish(at(100.1, { rate: 2, playing: false }), "pause");
  assert.deepEqual(log, ["change:hum:false", "play", "change:drift:true", "pause"]);
  assert.equal(clock.current().rate, 2);
});
