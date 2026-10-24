import assert from "node:assert/strict";
import { test } from "node:test";

import { crossfadeGains, DEFAULT_BED } from "./bed.ts";
import {
  balanceText,
  bedVolume,
  createDucker,
  DEFAULT_MIX,
  detectVoice,
  DUCK_ATTACK_MS,
  DUCK_GAIN,
  DUCK_RELEASE_MS,
  duckStep,
  mixLevels,
  normalizeMix,
  percentText,
  rms,
  SILENT,
  VOICE_HANGOVER_MS,
  VOICE_THRESHOLD,
} from "./mix.ts";

test("the default mix: the bed under the narration at 60%, master full, duck off, quiet opening on", () => {
  assert.deepEqual(DEFAULT_MIX, { balance: -0.4, master: 1, duck: false, quietOpening: true, ...DEFAULT_BED });
  assert.deepEqual(mixLevels(DEFAULT_MIX), { narration: 1, bed: 0.6 });
});

test("a stored mix is normalized: broken or missing fields take the default, numbers are clamped", () => {
  assert.deepEqual(normalizeMix(null), DEFAULT_MIX);
  assert.deepEqual(normalizeMix("x"), DEFAULT_MIX);
  assert.deepEqual(normalizeMix({ balance: 5, master: -2, duck: true }), { ...DEFAULT_MIX, balance: 1, master: 0, duck: true });
  assert.deepEqual(normalizeMix({ balance: Number.NaN, master: "1", duck: "yes" }), DEFAULT_MIX);
  assert.deepEqual(normalizeMix({ balance: 0.12345, master: 0.98765 }), { ...DEFAULT_MIX, balance: 0.123, master: 0.988 });
});

test("A4: quiet opening is on by default; a mix saved before it existed reads on; off is kept", () => {
  assert.equal(DEFAULT_MIX.quietOpening, true);
  // A mix saved before 07.3 has no quietOpening field.
  const old = { balance: -0.2, master: 0.8, duck: true, layer: "soundscape", soundscapeId: "rain" };
  assert.equal(normalizeMix(old).quietOpening, true);
  assert.equal(normalizeMix({ quietOpening: "no" }).quietOpening, true);
  assert.equal(normalizeMix({ quietOpening: false }).quietOpening, false);
  assert.equal(normalizeMix(normalizeMix({ quietOpening: false })).quietOpening, false);
});

test("A10: the balance turns one side down and master scales both", () => {
  assert.deepEqual(mixLevels({ balance: 0, master: 1, duck: false }), { narration: 1, bed: 1 });
  assert.deepEqual(mixLevels({ balance: -1, master: 1, duck: false }), { narration: 1, bed: 0 });
  assert.deepEqual(mixLevels({ balance: 1, master: 1, duck: false }), { narration: 0, bed: 1 });
  assert.deepEqual(mixLevels({ balance: 0.25, master: 1, duck: false }), { narration: 0.75, bed: 1 });
  assert.deepEqual(mixLevels({ balance: -0.4, master: 0.5, duck: false }), { narration: 0.5, bed: 0.3 });
  assert.deepEqual(mixLevels({ balance: 0, master: 0, duck: false }), { narration: 0, bed: 0 });
  // Out-of-range input is clamped first.
  assert.deepEqual(mixLevels({ balance: -3, master: 2, duck: false }), { narration: 1, bed: 0 });
});

test("a bed deck's volume composes the bed level with the crossfade and the duck", () => {
  assert.equal(bedVolume(0.6, 1), 0.6);
  assert.equal(bedVolume(0.6, 1, 0.5), 0.3);
  assert.equal(bedVolume(1, 0), 0);
  const mid = crossfadeGains(1000);
  assert.equal(bedVolume(0.5, mid.in), Math.round(0.5 * mid.in * 1e6) / 1e6);
  assert.equal(bedVolume(2, 2, 2), 1);
  assert.equal(bedVolume(-1, 1, 1), 0);
});

test("A3: the enter-exit gain is the fourth factor of one multiplied chain", () => {
  // Absent, it is full: every caller before 07.3 reads the same.
  assert.equal(bedVolume(0.6, 1, 1), bedVolume(0.6, 1, 1, 1));
  assert.equal(bedVolume(0.6, 1, 1, 0), 0);
  assert.equal(bedVolume(0.6, 1, 1, 0.5), 0.3);
  assert.equal(bedVolume(0.8, 0.5, 0.5, 0.5), 0.1);
  assert.equal(bedVolume(1, 1, 1, 2), 1);
  assert.equal(bedVolume(1, 1, 1, -1), 0);
});

test("the sliders read as words", () => {
  assert.equal(balanceText(DEFAULT_MIX), "Narration 100%, layer 60%");
  assert.equal(balanceText({ balance: 0.3, master: 1, duck: false }), "Narration 70%, layer 100%");
  assert.equal(percentText(0.804), "80%");
  assert.equal(percentText(3), "100%");
});

test("rms of a block of samples", () => {
  assert.equal(rms([]), 0);
  assert.equal(rms([0, 0, 0]), 0);
  assert.equal(rms([0.5, -0.5, 0.5, -0.5]), 0.5);
  assert.equal(rms([1, Number.NaN, -1, 1]), Math.sqrt(3 / 4));
});

test("A11: the voice detector holds through short gaps between words and lets go in a pause", () => {
  const loud = VOICE_THRESHOLD * 4;
  const quiet = VOICE_THRESHOLD / 4;
  let v = detectVoice(SILENT, quiet, 0);
  assert.equal(v.active, false);
  v = detectVoice(v, loud, 100);
  assert.deepEqual(v, { active: true, lastAt: 100 });
  // A gap shorter than the hangover is still voice.
  v = detectVoice(v, quiet, 100 + VOICE_HANGOVER_MS - 50);
  assert.equal(v.active, true);
  v = detectVoice(v, loud, 100 + VOICE_HANGOVER_MS);
  assert.equal(v.active, true);
  // A pause longer than the hangover is not.
  v = detectVoice(v, quiet, 100 + VOICE_HANGOVER_MS * 2 + 1);
  assert.equal(v.active, false);
  assert.equal(detectVoice(SILENT, VOICE_THRESHOLD, 0).active, true);
});

test("A11: the duck envelope dips quickly under a voice and comes back slower in a pause", () => {
  // One attack time constant covers about 63% of the way down.
  const down = duckStep(1, true, DUCK_ATTACK_MS);
  assert.ok(Math.abs(down - (DUCK_GAIN + (1 - DUCK_GAIN) * Math.exp(-1))) < 1e-3);
  const up = duckStep(DUCK_GAIN, false, DUCK_ATTACK_MS);
  // The release is slower: after the same time it has come back less of the way than the attack went down.
  assert.ok(1 - down > up - DUCK_GAIN);
  const half = DUCK_RELEASE_MS / 2;
  assert.ok(Math.abs(duckStep(duckStep(DUCK_GAIN, false, half), false, half) - (1 - (1 - DUCK_GAIN) * Math.exp(-1))) < 1e-3);
  // It settles exactly on its targets.
  let g = 1;
  for (let i = 0; i < 100; i++) g = duckStep(g, true, 50);
  assert.equal(g, DUCK_GAIN);
  for (let i = 0; i < 100; i++) g = duckStep(g, false, 50);
  assert.equal(g, 1);
  // Duck off is always full; a stall or a bad dt never jumps the gain.
  assert.equal(duckStep(DUCK_GAIN, true, 50, false), 1);
  assert.equal(duckStep(1, true, 0), 1);
  assert.equal(duckStep(1, true, Number.NaN), 1);
  assert.equal(duckStep(1, true, 10_000), duckStep(1, true, 250));
});

test("A11: the ducker dips the bed while the narrator speaks and brings it back in the pauses", () => {
  const speech = Array.from({ length: 256 }, (_, i) => Math.sin(i / 3) * 0.2);
  const silence = new Array(256).fill(0);
  const d = createDucker();
  let t = 0;
  let gain = 1;
  // Half a second of speech at about 60 blocks a second.
  for (; t < 500; t += 16) gain = d.hear(speech, t, true);
  assert.ok(gain < DUCK_GAIN + 0.05, `ducked under voice, got ${gain}`);
  // A 150 ms gap between words: still ducked.
  for (const end = t + 150; t < end; t += 16) gain = d.hear(silence, t, true);
  assert.ok(gain < DUCK_GAIN + 0.05, `held through a short gap, got ${gain}`);
  // A four-second pause: all the way back up.
  for (const end = t + 4000; t < end; t += 16) gain = d.hear(silence, t, true);
  assert.equal(gain, 1);
  // Duck off: speech changes nothing.
  for (const end = t + 500; t < end; t += 16) gain = d.hear(speech, t, false);
  assert.equal(gain, 1);
  d.hear(speech, t, true);
  assert.equal(d.reset(), 1);
  assert.equal(d.gain(), 1);
});
