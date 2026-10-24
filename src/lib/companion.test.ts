import assert from "node:assert/strict";
import { test } from "node:test";

import { planBed, IDLE_BED, type BedState } from "./bed.ts";
import { createClock, type ClockEvent, type ClockState } from "./clock.ts";
import {
  COMPANION_HOLD,
  COMPANION_SESSION,
  companionFinished,
  companionMove,
  companionPause,
  companionPlay,
  companionPosition,
  companionRate,
  NARRATION_SESSION,
  rebase,
  sessionFor,
  startCompanion,
} from "./companion.ts";
import { chapterAt, sleepDue } from "./timeline.ts";

// Two chapters: 0 to 100 s and 100 to 220 s.
const BOOK = {
  duration: 220,
  chapters: [
    { index: 0, start: 0, end: 100 },
    { index: 1, start: 100, end: 220 },
  ],
};
const T0 = 1_000_000;
const at = (seconds: number) => T0 + seconds * 1000;

test("A27, A4: with companion mode off the session is today's exactly: doNotMix, the lock screen and the narration", () => {
  assert.deepEqual(sessionFor(false), {
    audioMode: { playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" },
    narration: true,
    lockScreen: true,
  });
  assert.equal(sessionFor(false), NARRATION_SESSION);
});

test("A27: companion mode mixes with the other app, plays no narration and claims no lock screen", () => {
  const s = sessionFor(true);
  assert.equal(s, COMPANION_SESSION);
  assert.equal(s.audioMode.interruptionMode, "mixWithOthers");
  // Never exclusive focus (on Android, doNotMixPersistent is AUDIOFOCUS_GAIN) and never ducking the other app.
  assert.ok(!["doNotMix", "doNotMixPersistent", "duckOthers"].includes(s.audioMode.interruptionMode));
  // iOS .playback (playsInSilentMode on) so it keeps playing in the background beside the other app.
  assert.equal(s.audioMode.playsInSilentMode, true);
  assert.equal(s.audioMode.shouldPlayInBackground, true);
  assert.equal(s.narration, false);
  assert.equal(s.lockScreen, false);
});

test("the clock starts paused where the narration stopped, and runs at the book's speed while playing", () => {
  const c = startCompanion(30, 1.5, T0);
  assert.equal(companionPosition(c, at(10), BOOK, false), 30);
  const playing = companionPlay(c, T0, BOOK, false);
  assert.equal(companionPosition(playing, at(10), BOOK, false), 45);
  const paused = companionPause(playing, at(10), BOOK, false);
  assert.equal(paused.playing, false);
  assert.equal(companionPosition(paused, at(60), BOOK, false), 45);
  assert.equal(startCompanion(-5, 1, T0).anchor, 0);
});

test("A27, by tap: with the timer off the clock holds in its chapter until the listener moves it", () => {
  const c = companionPlay(startCompanion(90, 1, T0), T0, BOOK, false);
  const held = companionPosition(c, at(500), BOOK, false);
  assert.equal(held, 100 - COMPANION_HOLD);
  assert.equal(chapterAt(BOOK.chapters, held)?.index, 0);
  // Still inside the End of chapter sleep timer's slack, so that timer fires at the hold.
  assert.equal(sleepDue({ kind: "chapterEnd", end: 100 }, 0, held), true);
  assert.equal(companionFinished(c, at(500), BOOK, false), false);

  // A tap on Ch.2 in the river moves it there and plays.
  const tapped = companionMove(c, at(500), 100, true, BOOK);
  assert.equal(chapterAt(BOOK.chapters, companionPosition(tapped, at(501), BOOK, false))?.index, 1);
  // A skip back crosses into Ch.1 again; moves clamp to the book.
  assert.equal(companionMove(tapped, at(501), -30, false, BOOK).anchor, 0);
  assert.equal(companionMove(tapped, at(501), 999, false, BOOK).anchor, 220);
  assert.equal(companionMove(tapped, at(501), Number.NaN, false, BOOK).anchor, 0);
});

test("A27, by timer: with the timer on the clock runs into the next chapter by the book's lengths and stops at its end", () => {
  const c = companionPlay(startCompanion(90, 1, T0), T0, BOOK, true);
  assert.equal(chapterAt(BOOK.chapters, companionPosition(c, at(5), BOOK, true))?.index, 0);
  assert.equal(chapterAt(BOOK.chapters, companionPosition(c, at(11), BOOK, true))?.index, 1);
  assert.equal(companionFinished(c, at(100), BOOK, true), false);
  assert.equal(companionPosition(c, at(200), BOOK, true), 220);
  assert.equal(companionFinished(c, at(200), BOOK, true), true);
  // Play once it has run out starts the book again.
  const again = companionPlay(companionPause(c, at(200), BOOK, true), at(200), BOOK, true);
  assert.equal(again.anchor, 0);
  assert.equal(again.playing, true);
});

test("turning the timer on at a hold moves on from there; a speed change keeps the place", () => {
  const c = companionPlay(startCompanion(95, 1, T0), T0, BOOK, false);
  const based = rebase(c, at(60), BOOK, false);
  assert.equal(based.anchor, 100 - COMPANION_HOLD);
  assert.equal(chapterAt(BOOK.chapters, companionPosition(based, at(61), BOOK, true))?.index, 1);

  const faster = companionRate(companionPlay(startCompanion(0, 1, T0), T0, BOOK, true), at(10), 2, BOOK, true);
  assert.equal(faster.anchor, 10);
  assert.equal(companionPosition(faster, at(20), BOOK, true), 30);
});

test("A27: a chapter tap in companion mode crosses the bed into that chapter's sound with a crossfade", () => {
  // The clock the bed follows, published from the companion clock as the player does.
  const clock = createClock();
  const sounds: Record<number, string> = { 0: "night-wind", 1: "tide" };
  let bed: BedState = IDLE_BED;
  const seen: { event: ClockEvent; commands: ReturnType<typeof planBed>["commands"] }[] = [];
  clock.subscribe((s: ClockState, event) => {
    const plan = planBed(bed, s, event, {
      chapterStart: BOOK.chapters.find((c) => c.index === s.chapterIndex)?.start ?? 0,
      soundFor: (i) => (i === null ? null : sounds[i]),
      loopSeconds: () => 24,
    });
    bed = plan.state;
    seen.push({ event, commands: plan.commands });
  });
  const publish = (c: ReturnType<typeof startCompanion>, now: number, event: ClockEvent) => {
    const position = companionPosition(c, now, BOOK, false);
    clock.publish(
      { bookId: "b", position, playing: c.playing, rate: c.rate, chapterIndex: chapterAt(BOOK.chapters, position)!.index },
      event,
    );
  };
  let c = startCompanion(10, 1, T0);
  publish(c, T0, "load");
  c = companionPlay(c, T0, BOOK, false);
  publish(c, T0, "play");
  assert.equal(bed.soundId, "night-wind");
  assert.equal(bed.playing, true);
  c = companionMove(c, at(5), 100, true, BOOK);
  publish(c, at(5), "seek");
  assert.deepEqual(seen.at(-1)!.commands, [{ type: "change", to: "tide", offset: 0, play: true, fade: true }]);
  // A timer crossing does the same, reported as a chapter change.
  c = companionMove(c, at(6), 90, true, BOOK);
  publish(c, at(6), "seek");
  const timed = companionPlay(companionPause(c, at(6), BOOK, true), at(6), BOOK, true);
  const position = companionPosition(timed, at(17), BOOK, true);
  clock.publish({ bookId: "b", position, playing: true, rate: 1, chapterIndex: chapterAt(BOOK.chapters, position)!.index }, "tick");
  assert.equal(seen.at(-1)!.event, "chapter");
  assert.equal(seen.at(-1)!.commands[0].type, "change");
});
