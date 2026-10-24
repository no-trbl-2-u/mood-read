import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BED_RATE,
  bedOffset,
  bedSoundFor,
  crossfadeGains,
  CROSSFADE_MS,
  DEFAULT_BED,
  defaultBedFor,
  IDLE_BED,
  normalizeBed,
  pickFor,
  pickLayer,
  planBed,
  setChapterOnly,
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
