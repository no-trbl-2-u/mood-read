import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BED_ENTER_MS,
  BED_EXIT_MS,
  bedEnvelope,
  BED_RATE,
  closingGain,
  enterGain,
  entersNow,
  exitGain,
  OPENING_HOLD_S,
  openingGain,
  rampIn,
  rampOut,
  SLEEP_FADE_S,
  sleepFade,
  sleepGain,
  type EnvelopeInput,
  bedOffset,
  bedSoundFor,
  bedsAfterMerge,
  bedsAfterSplit,
  crossfadeGains,
  CROSSFADE_MS,
  DEFAULT_BED,
  defaultBedFor,
  IDLE_BED,
  normalizeBed,
  pickFor,
  pickLayer,
  planBed,
  NO_SCENE,
  planScene,
  sceneAt,
  sceneContextFor,
  sceneLogLine,
  sceneStarts,
  setChapterOnly,
  type SceneContext,
  type BedContext,
  type BedSetting,
  type BedState,
} from "./bed.ts";
import { createClock, type ClockEvent, type ClockState } from "./clock.ts";
import { OWNED_LICENSE, SOUNDSCAPE_IDS, SOUNDSCAPE_INFO, soundscapeInfo } from "./soundscapes.ts";

const CATALOG = ["hum", "drift"] as const;
// The book plays hum; chapter 1 has its own, drift, so its boundary is heard as a crossfade (A8).
const SETTING: BedSetting = { layer: "soundscape", soundscapeId: "hum", chapterBeds: { "1": { layer: "soundscape", soundscapeId: "drift" } } };
// Two chapters: 0 to 100 s and 100 to 220 s; both loops 4 s long.
const STARTS = [0, 100];
const ctxAt = (clock: ClockState): BedContext => ({
  chapterStart: STARTS[clock.chapterIndex ?? 0] ?? 0,
  soundFor: (i) => bedSoundFor(i, SETTING, CATALOG),
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

test("A12: a chapter's own layer wins over the book's; the book's covers the rest; off and music play nothing", () => {
  const cat = ["rain", "night-wind", "tide"];
  const book: BedSetting = { layer: "soundscape", soundscapeId: "rain", chapterBeds: { "2": { layer: "soundscape", soundscapeId: "tide" }, "3": { layer: "off", soundscapeId: null } } };
  assert.equal(bedSoundFor(0, book, cat), "rain");
  assert.equal(bedSoundFor(2, book, cat), "tide");
  assert.equal(bedSoundFor(3, book, cat), null);
  assert.equal(bedSoundFor(2, { ...book, layer: "off", soundscapeId: null }, cat), "tide");
  assert.equal(bedSoundFor(0, { ...book, layer: "off", soundscapeId: null }, cat), null);
  assert.equal(bedSoundFor(0, { layer: "music", soundscapeId: null, chapterBeds: {} }, cat), null);
});

test("06.3: with no default soundscape set, a book with no layer of its own plays as 01.7 has it", () => {
  assert.deepEqual(defaultBedFor(null), DEFAULT_BED);
  assert.deepEqual(normalizeBed(undefined, defaultBedFor(null)), DEFAULT_BED);
  assert.deepEqual(normalizeBed({ balance: 0 }, defaultBedFor(null)), DEFAULT_BED);
  assert.equal(bedSoundFor(3, normalizeBed(undefined, defaultBedFor(null)), SOUNDSCAPE_IDS), "night-wind");
});

test("06.3: a book with no layer of its own plays the default soundscape setting, or none when it is Off", () => {
  const tide = normalizeBed(undefined, defaultBedFor("tide"));
  assert.deepEqual(tide, { layer: "soundscape", soundscapeId: "tide", chapterBeds: {} });
  assert.equal(bedSoundFor(0, tide, SOUNDSCAPE_IDS), "tide");
  assert.equal(bedSoundFor(5, normalizeBed({ balance: 0.2 }, defaultBedFor("rain")), SOUNDSCAPE_IDS), "rain");
  const off = normalizeBed(undefined, defaultBedFor("off"));
  assert.deepEqual(off, { layer: "off", soundscapeId: null, chapterBeds: {} });
  assert.equal(bedSoundFor(0, off, SOUNDSCAPE_IDS), null);
  // A setting naming a loop no longer bundled plays as an unknown book choice does.
  assert.equal(bedSoundFor(0, normalizeBed(undefined, defaultBedFor("test-drift")), SOUNDSCAPE_IDS), "night-wind");
});

test("06.3: a book's own layer, and a chapter's own, always win over the default soundscape setting", () => {
  const saved = { layer: "soundscape", soundscapeId: "hearth-fire", chapterBeds: { "2": { layer: "off", soundscapeId: null } } };
  for (const setting of [null, "off", "tide"]) {
    const bed = normalizeBed(saved, defaultBedFor(setting));
    assert.equal(bedSoundFor(0, bed, SOUNDSCAPE_IDS), "hearth-fire", String(setting));
    assert.equal(bedSoundFor(2, bed, SOUNDSCAPE_IDS), null, String(setting));
  }
  const offBook = normalizeBed({ layer: "off", soundscapeId: null }, defaultBedFor("tide"));
  assert.equal(bedSoundFor(0, offBook, SOUNDSCAPE_IDS), null);
});

test("A12: a new book plays Night Wind under every chapter; a loop no longer bundled falls back to it, then to the first", () => {
  assert.equal(DEFAULT_BED.soundscapeId, "night-wind");
  assert.ok(SOUNDSCAPE_IDS.includes(DEFAULT_BED.soundscapeId!));
  assert.equal(bedSoundFor(0, DEFAULT_BED, SOUNDSCAPE_IDS), "night-wind");
  assert.equal(bedSoundFor(7, DEFAULT_BED, SOUNDSCAPE_IDS), "night-wind");
  const gone: BedSetting = { layer: "soundscape", soundscapeId: "test-low-hum", chapterBeds: {} };
  assert.equal(bedSoundFor(0, gone, SOUNDSCAPE_IDS), "night-wind");
  assert.equal(bedSoundFor(0, gone, ["rain", "tide"]), "rain");
  assert.equal(bedSoundFor(null, DEFAULT_BED, SOUNDSCAPE_IDS), null);
  assert.equal(bedSoundFor(0, DEFAULT_BED, []), null);
});

test("A12: a pick sets the book's layer, or the chapter's own while This chapter only is on", () => {
  let s = pickLayer(DEFAULT_BED, 1, "rain");
  assert.deepEqual(s, { layer: "soundscape", soundscapeId: "rain", chapterBeds: {} });
  s = setChapterOnly(s, 1, true);
  assert.deepEqual(s.chapterBeds, { "1": { layer: "soundscape", soundscapeId: "rain" } });
  assert.equal(bedSoundFor(1, s, SOUNDSCAPE_IDS), "rain", "turning it on changes nothing heard");
  s = pickLayer(s, 1, "tide");
  assert.equal(bedSoundFor(1, s, SOUNDSCAPE_IDS), "tide");
  assert.equal(bedSoundFor(0, s, SOUNDSCAPE_IDS), "rain");
  s = pickLayer(s, 1, "off");
  assert.equal(bedSoundFor(1, s, SOUNDSCAPE_IDS), null);
  assert.equal(pickFor(1, s, SOUNDSCAPE_IDS), "off");
  assert.equal(pickFor(0, s, SOUNDSCAPE_IDS), "rain");
  s = pickLayer(s, 0, "low-cafe");
  assert.equal(bedSoundFor(0, s, SOUNDSCAPE_IDS), "low-cafe");
  assert.equal(bedSoundFor(1, s, SOUNDSCAPE_IDS), null, "the chapter keeps its own");
  s = setChapterOnly(s, 1, false);
  assert.deepEqual(s.chapterBeds, {});
  assert.equal(bedSoundFor(1, s, SOUNDSCAPE_IDS), "low-cafe", "off again, it follows the book");
  assert.equal(setChapterOnly(s, 1, false), s);
  assert.equal(setChapterOnly(s, null, true), s);
  assert.equal(pickFor(0, { layer: "music", soundscapeId: null, chapterBeds: {} }, SOUNDSCAPE_IDS), null);
});

test("A12: a stored bed is normalized: broken parts take the default, broken chapters are dropped", () => {
  assert.deepEqual(normalizeBed(undefined), DEFAULT_BED);
  assert.deepEqual(normalizeBed({ balance: 0 }), DEFAULT_BED, "a mix saved before 01.7");
  assert.deepEqual(normalizeBed({ layer: "loud", soundscapeId: "rain" }), DEFAULT_BED);
  assert.deepEqual(normalizeBed({ layer: "off", soundscapeId: "rain" }), { layer: "off", soundscapeId: null, chapterBeds: {} });
  assert.deepEqual(normalizeBed({ layer: "soundscape", soundscapeId: 4 }), DEFAULT_BED);
  assert.deepEqual(
    normalizeBed({
      layer: "soundscape",
      soundscapeId: "tide",
      chapterBeds: { "0": { layer: "off" }, "02": { layer: "soundscape", soundscapeId: "rain" }, x: { layer: "off" }, "-1": { layer: "off" }, "5": "rain", "6": null },
    }),
    { layer: "soundscape", soundscapeId: "tide", chapterBeds: { "0": { layer: "off", soundscapeId: null }, "2": { layer: "soundscape", soundscapeId: "rain" } } },
  );
});

test("A18: every bundled soundscape carries a license that lets the app play it, and the catalog has six or more", () => {
  assert.ok(SOUNDSCAPE_INFO.length >= 6);
  assert.deepEqual(
    SOUNDSCAPE_INFO.map((s) => s.name),
    ["Rain", "Hearth Fire", "Night Wind", "Tide", "Static Hush", "Low Café"],
  );
  for (const s of SOUNDSCAPE_INFO) {
    assert.equal(s.license, OWNED_LICENSE);
    assert.match(s.license, /^Owned by the project/);
    assert.equal(s.loopSeconds, 24);
  }
  assert.equal(new Set(SOUNDSCAPE_IDS).size, SOUNDSCAPE_IDS.length);
  assert.equal(soundscapeInfo("tide")?.name, "Tide");
  assert.equal(soundscapeInfo(null), undefined);
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

// ---- The bed enters and leaves (07.3, A3, A4) ---------------------------------------------------------------

test("07.3: the constants are the spec's", () => {
  assert.equal(BED_ENTER_MS, 1500);
  assert.equal(SLEEP_FADE_S, 60);
  assert.equal(OPENING_HOLD_S, 20);
  assert.equal(BED_EXIT_MS, 4000);
});

test("A3: ramps are equal-power and pure in elapsed ms, clamped at both ends", () => {
  assert.equal(rampIn(0, 1000), 0);
  assert.equal(rampIn(1000, 1000), 1);
  assert.equal(rampIn(-50, 1000), 0);
  assert.equal(rampIn(5000, 1000), 1);
  assert.equal(rampOut(0, 1000), 1);
  assert.equal(rampOut(1000, 1000), 0);
  assert.equal(rampIn(Number.NaN, 1000), 0);
  let last = -1;
  for (let ms = 0; ms <= 1000; ms += 50) {
    const g = rampIn(ms, 1000);
    assert.ok(g >= last, "rises without a step back");
    assert.ok(Math.abs(g * g + rampOut(ms, 1000) ** 2 - 1) < 1e-5);
    last = g;
  }
});

test("A3: the bed enters from silence over BED_ENTER_MS; with no entry under way it is full", () => {
  assert.equal(enterGain(0), 0);
  assert.ok(enterGain(BED_ENTER_MS / 2) > 0 && enterGain(BED_ENTER_MS / 2) < 1);
  assert.equal(enterGain(BED_ENTER_MS), 1);
  assert.equal(enterGain(60_000), 1);
  assert.equal(enterGain(null), 1);
});

test("A3: the bed enters on a cold start, after a pause and after a seek; nothing else restarts it", () => {
  const playing = at(9);
  assert.equal(entersNow(false, playing, "play"), true);
  // A resume that arrives as a tick (the narration starting after a load) is still an entry.
  assert.equal(entersNow(false, playing, "tick"), true);
  assert.equal(entersNow(true, at(40), "seek"), true);
  assert.equal(entersNow(true, at(40), "load"), true);
  for (const event of ["tick", "chapter", "rate", "play"] as const) assert.equal(entersNow(true, at(101), event), false);
  // Paused, or no book: nothing enters.
  assert.equal(entersNow(false, at(9, { playing: false }), "seek"), false);
  assert.equal(entersNow(false, at(9, { bookId: null }), "play"), false);
});

test("A4: quiet opening holds the bed silent for the chapter's first 20 s, then ramps it in; off, it is full", () => {
  const hold = OPENING_HOLD_S * 1000;
  for (const ms of [0, 1, 5000, hold - 1, hold]) assert.equal(openingGain(ms, true), 0);
  assert.ok(openingGain(hold + BED_ENTER_MS / 2, true) > 0);
  assert.ok(openingGain(hold + BED_ENTER_MS / 2, true) < 1);
  assert.equal(openingGain(hold + BED_ENTER_MS, true), 1);
  // A seek past the hold skips it: the place in the chapter is past it. A seek back to the start brings it back.
  assert.equal(openingGain(30_000, true), 1);
  assert.equal(openingGain(0, true), 0);
  // Off, the bed enters at once (only the enter ramp applies).
  for (const ms of [0, 5000, hold, 30_000]) assert.equal(openingGain(ms, false), 1);
});

test("A4: before a boundary into a held opening the bed fades out, so the hold starts silent rather than cut", () => {
  assert.equal(closingGain(10_000, true, true), 1);
  assert.equal(closingGain(BED_ENTER_MS, true, true), 1);
  assert.ok(closingGain(BED_ENTER_MS / 2, true, true) < 1);
  assert.equal(closingGain(0, true, true), 0);
  // Off, or a clock that does not run on (the last chapter; a companion clock holding at the end): full.
  assert.equal(closingGain(0, false, true), 1);
  assert.equal(closingGain(0, true, false), 1);
});

test("A3: a minutes timer fades over its last 60 s, or a shorter timer over its whole length", () => {
  const now = 1_000_000;
  const fifteen = { kind: "minutes" as const, minutes: 15, endsAt: now + 15 * 60_000 };
  assert.deepEqual(sleepFade(fifteen, now, 0, []), { leftMs: 15 * 60_000, fadeMs: 60_000 });
  assert.equal(sleepGain(sleepFade(fifteen, now, 0, [])), 1);
  assert.equal(sleepGain(sleepFade(fifteen, fifteen.endsAt - 60_000, 0, [])), 1);
  const mid = sleepGain(sleepFade(fifteen, fifteen.endsAt - 30_000, 0, []));
  assert.ok(mid > 0 && mid < 1);
  // It fires with the bed silent.
  assert.equal(sleepGain(sleepFade(fifteen, fifteen.endsAt, 0, [])), 0);
  assert.equal(sleepGain(sleepFade(fifteen, fifteen.endsAt + 500, 0, [])), 0);
  // Half a minute: the fade is the whole timer, so it starts falling at once.
  const short = { kind: "minutes" as const, minutes: 0.5, endsAt: now + 30_000 };
  assert.deepEqual(sleepFade(short, now, 0, []), { leftMs: 30_000, fadeMs: 30_000 });
  assert.equal(sleepGain(sleepFade(short, now, 0, [])), 1);
  assert.ok(sleepGain(sleepFade(short, now + 1000, 0, [])) < 1);
  assert.equal(sleepGain(null), 1);
});

test("A3: an End of chapter timer fades over the chapter's last 60 s, or the whole of a shorter chapter", () => {
  const chapters = [
    { index: 0, start: 0, end: 100 },
    { index: 1, start: 100, end: 130 },
  ];
  const long = { kind: "chapterEnd" as const, chapterIndex: 0, end: 100 };
  assert.deepEqual(sleepFade(long, 0, 10, chapters), { leftMs: 90_000, fadeMs: 60_000 });
  assert.equal(sleepGain(sleepFade(long, 0, 40, chapters)), 1);
  assert.ok(sleepGain(sleepFade(long, 0, 70, chapters)) < 1);
  assert.equal(sleepGain(sleepFade(long, 0, 100, chapters)), 0);
  const short = { kind: "chapterEnd" as const, chapterIndex: 1, end: 130 };
  assert.deepEqual(sleepFade(short, 0, 100, chapters), { leftMs: 30_000, fadeMs: 30_000 });
  assert.equal(sleepGain(sleepFade(short, 0, 130, chapters)), 0);
  assert.equal(sleepFade(null, 0, 0, chapters), null);
});

test("A3: at the book's end the bed fades out over BED_EXIT_MS instead of cutting", () => {
  assert.equal(exitGain(0), 1);
  assert.ok(exitGain(BED_EXIT_MS / 2) > 0 && exitGain(BED_EXIT_MS / 2) < 1);
  assert.equal(exitGain(BED_EXIT_MS), 0);
  assert.equal(exitGain(10_000), 0);
  // The engine is told: the clock stopping at the end pauses the bed with that fade, playing on until it is done.
  const playing: BedState = { soundId: "drift", playing: true };
  const end = at(220, { playing: false, chapterIndex: 1 });
  assert.deepEqual(planBed(playing, end, "tick", { ...ctxAt(end), exitMs: BED_EXIT_MS }).commands, [
    { type: "pause", fadeMs: BED_EXIT_MS },
  ]);
  // With no exit fade the pause is at once, as before.
  const hum: BedState = { soundId: "hum", playing: true };
  assert.deepEqual(planBed(hum, at(50, { playing: false }), "pause", ctxAt(at(50))).commands, [{ type: "pause" }]);
});

test("A3, A4: the enter-exit gain multiplies the enter ramp, the opening hold, its closing fade and the sleep fade", () => {
  const base: EnvelopeInput = {
    sinceEnterMs: null,
    intoChapterMs: 60_000,
    chapterLeftMs: 60_000,
    quietOpening: true,
    runsOn: true,
    sleep: null,
  };
  assert.equal(bedEnvelope(base), 1);
  // A play at the chapter's start: silent through the hold, in full once it and its ramp are done.
  assert.equal(bedEnvelope({ ...base, sinceEnterMs: 0, intoChapterMs: 0 }), 0);
  assert.equal(bedEnvelope({ ...base, sinceEnterMs: 19_000, intoChapterMs: 19_000 }), 0);
  assert.equal(bedEnvelope({ ...base, sinceEnterMs: 21_500, intoChapterMs: 21_500 }), 1);
  // Off: the bed enters at once, over the enter ramp only.
  assert.equal(bedEnvelope({ ...base, quietOpening: false, sinceEnterMs: BED_ENTER_MS, intoChapterMs: 0 }), 1);
  // A seek past the hold: only the enter ramp.
  assert.equal(bedEnvelope({ ...base, sinceEnterMs: 750, intoChapterMs: 40_000 }), enterGain(750));
  // The product of every factor.
  const i = { ...base, sinceEnterMs: 700, intoChapterMs: 20_900, sleep: { leftMs: 20_000, fadeMs: 60_000 } };
  const product = enterGain(700) * openingGain(20_900, true) * sleepGain(i.sleep);
  assert.equal(bedEnvelope(i), Math.round(product * 1e6) / 1e6);
  assert.equal(bedEnvelope({ ...base, sleep: { leftMs: 0, fadeMs: 60_000 } }), 0);
});

// ---- Scenes inside a chapter (07.2, spec 07 A2) -------------------------------------------------------------

const span = (...spans: number[]) => spans.map((s) => ({ span: s }));

test("A2: sceneAt maps the place in the chapter to a scene by its span; a boundary belongs to the scene it starts", () => {
  const scenes = span(0.4, 0.35, 0.25);
  assert.equal(sceneAt(0, 100, scenes), 0);
  assert.equal(sceneAt(39.9, 100, scenes), 0);
  assert.equal(sceneAt(40, 100, scenes), 1);
  assert.equal(sceneAt(74.9, 100, scenes), 1);
  assert.equal(sceneAt(75, 100, scenes), 2);
  assert.equal(sceneAt(100, 100, scenes), 2, "the chapter's end is its last scene");
  assert.equal(sceneAt(500, 100, scenes), 2, "past the end clamps to the last scene");
  assert.equal(sceneAt(-5, 100, scenes), 0, "before the start clamps to the first");
  assert.deepEqual(sceneStarts(100, scenes), [0, 40, 75]);
});

test("A2: sceneAt with no scenes is null; one scene is the whole chapter; broken spans never throw", () => {
  assert.equal(sceneAt(10, 100, []), null);
  assert.equal(sceneAt(99, 100, span(1)), 0);
  assert.equal(sceneAt(Number.NaN, 100, span(0.5, 0.5)), 0, "an unknown place reads as the chapter's start");
  assert.equal(sceneAt(10, 0, span(0.5, 0.5)), 0, "a chapter with no length is its first scene");
  // Spans that do not sum to 1 are read as shares of the chapter.
  assert.deepEqual(sceneStarts(100, span(1, 1)), [0, 50]);
  // A broken span counts for nothing; with no usable span the scenes share the chapter evenly.
  assert.deepEqual(sceneStarts(90, span(Number.NaN, 0.5, 0.5)), [0, 0, 45]);
  assert.deepEqual(sceneStarts(90, span(0, -1, Number.NaN)), [0, 30, 60]);
});

const sceneCtx = (pieces: string[] = ["p1", "p2", "p3"]): SceneContext => ({
  chapterStart: 1000,
  chapterLength: 100,
  scenes: span(0.4, 0.35, 0.25).map((s) => ({ ...s, emotions: [] })),
  pieces,
});
const inScene = (position: number, over: Partial<ClockState> = {}): ClockState => ({
  bookId: "b",
  position,
  playing: true,
  rate: 1,
  chapterIndex: 3,
  ...over,
});

test("A2: crossing a scene boundary while playing crosses to the next scene's piece over CROSSFADE_MS", () => {
  const first = planScene(NO_SCENE, inScene(1010), sceneCtx());
  assert.deepEqual(first.spot, { bookId: "b", chapterIndex: 3, scene: 0, pieceId: "p1" });
  const steady = planScene(first.spot, inScene(1030), sceneCtx());
  assert.equal(steady.command, null, "a tick inside the scene does nothing");
  const cross = planScene(steady.spot, inScene(1040.2), sceneCtx());
  assert.deepEqual(cross.command, {
    type: "scene",
    chapterIndex: 3,
    scene: 1,
    from: 0,
    pieceId: "p2",
    direction: "on",
    crossfade: true,
    fadeMs: CROSSFADE_MS,
  });
  assert.deepEqual(cross.spot, { bookId: "b", chapterIndex: 3, scene: 1, pieceId: "p2" });
});

test("A2: a seek back crosses the boundary the other way", () => {
  const inThird = planScene(NO_SCENE, inScene(1080), sceneCtx()).spot;
  const back = planScene(inThird, inScene(1005), sceneCtx());
  assert.equal(back.command?.scene, 0);
  assert.equal(back.command?.from, 2);
  assert.equal(back.command?.direction, "back");
  assert.equal(back.command?.pieceId, "p1");
  assert.equal(back.command?.crossfade, true);
});

test("A2: paused, a scene change moves the spot without a crossfade", () => {
  const spot = planScene(NO_SCENE, inScene(1010, { playing: false }), sceneCtx()).spot;
  const moved = planScene(spot, inScene(1050, { playing: false }), sceneCtx());
  assert.equal(moved.command?.scene, 1);
  assert.equal(moved.command?.crossfade, false);
});

test("A2: a chapter-wide pick plays for every scene: the scene changes, the piece does not, nothing crossfades", () => {
  const picked = sceneCtx(["pick", "pick", "pick"]);
  const spot = planScene(NO_SCENE, inScene(1010), picked).spot;
  const cross = planScene(spot, inScene(1045), picked);
  assert.equal(cross.command?.scene, 1);
  assert.equal(cross.command?.pieceId, "pick");
  assert.equal(cross.command?.crossfade, false, "the same piece plays on across the boundary");
  // A pick made inside a scene crosses to the picked piece there and then.
  const repick = planScene(spot, inScene(1011), picked);
  assert.equal(repick.command, null, "same piece, same scene");
  const toPick = planScene(planScene(NO_SCENE, inScene(1010), sceneCtx()).spot, inScene(1011), picked);
  assert.equal(toPick.command?.scene, 0);
  assert.equal(toPick.command?.pieceId, "pick");
  assert.equal(toPick.command?.crossfade, true);
});

test("A2: entering a chapter places the scene without a scene crossfade (the chapter's change crosses on its own)", () => {
  const prev = { bookId: "b", chapterIndex: 2, scene: 0, pieceId: "x" };
  const entered = planScene(prev, inScene(1080), sceneCtx());
  assert.equal(entered.command?.direction, "enter");
  assert.equal(entered.command?.scene, 2);
  assert.equal(entered.command?.from, null);
  assert.equal(entered.command?.crossfade, false);
  assert.equal(entered.spot.pieceId, "p3");
});

test("A2: no book, no chapter or an unscored chapter has no scene and says nothing", () => {
  assert.deepEqual(planScene(NO_SCENE, inScene(1010, { bookId: null }), sceneCtx()), { spot: NO_SCENE, command: null });
  assert.deepEqual(planScene(NO_SCENE, inScene(1010), null), { spot: NO_SCENE, command: null });
  const spot = planScene(NO_SCENE, inScene(1010), sceneCtx()).spot;
  assert.deepEqual(planScene(spot, inScene(1010), null), { spot: NO_SCENE, command: null }, "scores gone: the spot clears quietly");
});

test("A2: a scene command never changes what the bed plays until 01.10: planBed's sound is the soundscape's", () => {
  // The bed's plan reads only the chapter's sound; a scene boundary inside the chapter is a tick to it.
  const ctx = { chapterStart: 1000, soundFor: () => "wind", loopSeconds: () => 60 };
  const playing = planBed(IDLE_BED, inScene(1010), "play", ctx).state;
  assert.deepEqual(planBed(playing, inScene(1041), "tick", ctx).commands, []);
});

test("A2: sceneContextFor reads a chapter's scenes and their pieces; a pick covers every scene", () => {
  const mood = {
    chapterIndex: 3,
    chapterTitle: "Three",
    emotions: [{ emotion: "tension" as const, intensity: 0.8 }],
    scenes: [
      { emotions: [{ emotion: "calm" as const, intensity: 0.5 }], span: 0.5 },
      { emotions: [{ emotion: "dread" as const, intensity: 0.9 }], span: 0.5 },
    ],
    sources: [],
    coverage: "scored" as const,
    model: "m",
    version: "v",
    scoredAt: 1,
  };
  const playlist = { chapterIndex: 3, piece: "p1", alternates: ["p2", "p3"], pick: "auto", scenePieces: ["p1", "p2"] };
  const chapter = { start: 1000, end: 1100 };
  const ctx = sceneContextFor({ mood, pieces: [], playlist }, chapter);
  assert.deepEqual(ctx?.pieces, ["p1", "p2"]);
  assert.equal(ctx?.chapterLength, 100);
  assert.equal(ctx?.scenes.length, 2);
  assert.deepEqual(sceneContextFor({ mood, pieces: [], playlist: { ...playlist, pick: "p3" } }, chapter)?.pieces, ["p3", "p3"]);
  // No scenes: one scene, the chapter's piece.
  assert.deepEqual(sceneContextFor({ mood: { ...mood, scenes: undefined }, pieces: [], playlist }, chapter)?.pieces, ["p1"]);
  assert.equal(sceneContextFor(null, chapter), null);
  assert.equal(sceneContextFor({ mood: { ...mood, coverage: "too-little" }, pieces: [], playlist }, chapter), null);
  // A chapter with no piece named still has scenes, each with no piece.
  assert.deepEqual(sceneContextFor({ mood, pieces: [], playlist: null }, chapter)?.pieces, [null, null]);
});

test("A2: the logged scene line names the chapter, the scene, its piece and the crossing", () => {
  const cmd = planScene(planScene(NO_SCENE, inScene(1010), sceneCtx()).spot, inScene(1041), sceneCtx()).command!;
  assert.equal(sceneLogLine(cmd), "bed scene: chapter=3 scene=1 piece=p2 direction=on crossfade=true");
  assert.equal(sceneLogLine({ ...cmd, pieceId: null, crossfade: false }), "bed scene: chapter=3 scene=1 piece=none direction=on crossfade=false");
});

const RAIN = { layer: "soundscape", soundscapeId: "rain" } as const;
const TIDE = { layer: "soundscape", soundscapeId: "tide" } as const;
const OFF = { layer: "off", soundscapeId: null } as const;

test("A32: merging keeps the first chapter's own bed and moves later chapters' down one", () => {
  const beds = { "0": RAIN, "1": OFF, "2": TIDE, "4": OFF };
  // Merging 1 with 2: the merged chapter 1 keeps 1's (off); 3 becomes 2, 4 becomes 3.
  assert.deepEqual(bedsAfterMerge(beds, 1), { "0": RAIN, "1": OFF, "3": OFF });
  // The first has none of its own: the merged chapter follows the book, and the second's own goes with it.
  assert.deepEqual(bedsAfterMerge({ "3": TIDE, "5": RAIN }, 2), { "4": RAIN });
  assert.deepEqual(bedsAfterMerge({}, 0), {});
});

test("A32: splitting gives both halves the chapter's own bed and moves later chapters' up one", () => {
  const beds = { "0": RAIN, "1": OFF, "2": TIDE };
  assert.deepEqual(bedsAfterSplit(beds, 1), { "0": RAIN, "1": OFF, "2": OFF, "3": TIDE });
  // A chapter with none of its own: both halves follow the book; the later ones still move.
  assert.deepEqual(bedsAfterSplit({ "0": RAIN, "3": TIDE }, 1), { "0": RAIN, "4": TIDE });
});

test("A32: the remaps never change the input", () => {
  const beds = { "1": OFF, "2": TIDE };
  bedsAfterMerge(beds, 0);
  bedsAfterSplit(beds, 1);
  assert.deepEqual(beds, { "1": OFF, "2": TIDE });
});
