// The committed soundscape loops (01.7, A12): six files, each a seamless loop. Reads the WAVs in assets/soundscapes/
// directly (no decoder needed) and checks the wrap from the last sample to the first is like any other step inside
// the loop: no click (a jump bigger than the loop's own largest steps), no drop-out or burst (the level around the
// wrap matches the loop's), and the bytes are what scripts/make-soundscapes.mjs writes today.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { LOOPS, N, RATE, SECONDS, TARGET_RMS, wav } from "../soundscapes/synth.mjs";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "soundscapes");

function read(file) {
  const buf = readFileSync(path.join(DIR, file));
  assert.equal(buf.toString("ascii", 0, 4), "RIFF");
  assert.equal(buf.readUInt16LE(20), 1, "PCM");
  assert.equal(buf.readUInt16LE(22), 1, "mono");
  assert.equal(buf.readUInt32LE(24), RATE);
  assert.equal(buf.readUInt16LE(34), 16);
  const n = buf.readUInt32LE(40) / 2;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(44 + i * 2) / 32768;
  return x;
}

const rms = (x, from, to) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[((i % x.length) + x.length) % x.length] ** 2;
  return Math.sqrt(s / (to - from));
};

test("A12: six or more soundscape loops, one per chip, each 24 s", () => {
  assert.ok(LOOPS.length >= 6);
  for (const { file } of LOOPS) assert.equal(read(file).length, N, `${file} is ${SECONDS} s`);
});

for (const { id, file } of LOOPS) {
  test(`A12: ${id} wraps from end to start without a seam`, () => {
    const x = read(file);
    const steps = [];
    for (let i = 1; i < x.length; i++) steps.push(Math.abs(x[i] - x[i - 1]));
    steps.sort((a, b) => a - b);
    const p999 = steps[Math.floor(steps.length * 0.999)];
    const wrap = Math.abs(x[0] - x[x.length - 1]);
    // The step across the wrap is an ordinary step: under the 99.9th percentile of the loop's own steps.
    assert.ok(wrap <= p999, `${id}: wrap step ${wrap.toFixed(5)} > p99.9 ${p999.toFixed(5)}`);
    // The first difference just after the wrap looks like the one just before (no kink): second difference ordinary.
    const d2 = Math.abs(x[1] - 2 * x[0] + x[x.length - 1]);
    const d2s = [];
    for (let i = 1; i < x.length - 1; i++) d2s.push(Math.abs(x[i + 1] - 2 * x[i] + x[i - 1]));
    d2s.sort((a, b) => a - b);
    assert.ok(d2 <= d2s[Math.floor(d2s.length * 0.999)], `${id}: a kink at the wrap`);
    // The level over 50 ms either side of the wrap is within the loop's range of 100 ms windows (no gap, no burst).
    const w = RATE / 20;
    const around = rms(x, -w, w);
    const windows = [];
    for (let s = 0; s + 2 * w <= x.length; s += w) windows.push(rms(x, s, s + 2 * w));
    windows.sort((a, b) => a - b);
    assert.ok(around >= windows[0] * 0.9 && around <= windows[windows.length - 1] * 1.1, `${id}: level jumps at the wrap`);
  });

  test(`A12: ${id} is quiet, soft and unclipped, and is exactly what the script writes`, () => {
    const x = read(file);
    const level = rms(x, 0, x.length);
    assert.ok(Math.abs(level - TARGET_RMS) < TARGET_RMS * 0.15, `${id}: rms ${level}`);
    assert.ok(x.every((v) => Math.abs(v) < 0.5), `${id}: peaks under the ceiling`);
    const loop = LOOPS.find((l) => l.id === id);
    assert.ok(readFileSync(path.join(DIR, file)).equals(wav(loop.render())), `${id}: run node scripts/make-soundscapes.mjs`);
  });
}
