// Spec 01 A6: chapter breaks from detected silences, over an envelope from decoded PCM or a streamed WAV.
import assert from "node:assert/strict";
import { test } from "node:test";

import { memorySource } from "./meta/bytes.ts";
import { toneAndSilence, wavFile } from "./meta/test-fixtures.ts";
import {
  createEnvelopeCache,
  envelopeFromPcm,
  findSilences,
  levelAt,
  silenceBreaks,
  wavEnvelope,
  type Envelope,
} from "./silence.ts";

const RATE = 8000;
const pcm = (spans: [number, boolean][]) => Float32Array.from(toneAndSilence(spans, RATE), (s) => s / 32768);

test("long silences are found; short pauses between words are not", () => {
  const env = envelopeFromPcm([pcm([[5, true], [0.4, false], [5, true], [3, false], [5, true]])], RATE);
  const found = findSilences(env, { minSilence: 2 });
  assert.equal(found.length, 1);
  assert.ok(Math.abs(found[0].start - 10.4) < 0.1, `start ${found[0].start}`);
  assert.ok(Math.abs(found[0].end - 13.4) < 0.1, `end ${found[0].end}`);
});

test("breaks fall mid-silence, skip lead-in and run-out, and keep chapters at least minChapter long", () => {
  const audio = pcm([
    [2, false],
    [20, true],
    [3, false],
    [5, true],
    [3, false],
    [20, true],
    [2, false],
  ]);
  const env = envelopeFromPcm([audio, audio], RATE);
  const duration = audio.length / RATE;
  const all = silenceBreaks(env, duration, { minChapter: 1 });
  assert.equal(all.length, 2);
  assert.ok(Math.abs(all[0] - 23.5) < 0.1 && Math.abs(all[1] - 31.5) < 0.1, String(all));
  // With 10 s minimum chapters, the second break would leave an 8 s chapter: dropped.
  assert.deepEqual(
    silenceBreaks(env, duration, { minChapter: 10 }).map(Math.round),
    [24],
  );
});

test("a WAV streams into the same envelope, in blocks, without decoding the whole file at once", async () => {
  const samples = toneAndSilence([[4, true], [3, false], [4, true]], RATE);
  const env = await wavEnvelope(memorySource(wavFile(samples, RATE)), 0.05, 1000);
  assert.ok(env);
  const breaks = silenceBreaks(env, 11, { minChapter: 1 });
  assert.equal(breaks.length, 1);
  assert.ok(Math.abs(breaks[0] - 5.5) < 0.1, String(breaks));
  assert.equal(await wavEnvelope(memorySource(new Uint8Array(20))), null);
});

test("an all-quiet or empty file has no breaks", () => {
  assert.deepEqual(silenceBreaks(envelopeFromPcm([new Float32Array(RATE * 10)], RATE), 10, { minChapter: 1 }), []);
  assert.deepEqual(findSilences({ levels: new Float32Array(0), window: 0.05 }), []);
});

// Android's duck cue (01.28): reading an envelope back at a playing position, instead of a live mic tap.

test("levelAt: no envelope, a negative time, or a zero window reads as silence", () => {
  const env: Envelope = { levels: Float32Array.from([0.1, 0.2, 0.3]), window: 0.05 };
  assert.equal(levelAt(null, 1), 0);
  assert.equal(levelAt(env, -1), 0);
  assert.equal(levelAt({ levels: Float32Array.from([]), window: 0.05 }, 0), 0);
  assert.equal(levelAt({ levels: env.levels, window: 0 }, 0), 0);
  assert.equal(levelAt({ levels: env.levels, window: -1 }, 0), 0);
});

test("levelAt: an in-range lookup picks the right window; past the end clamps to the last sample", () => {
  const env: Envelope = { levels: Float32Array.from([0.1, 0.2, 0.3]), window: 0.05 };
  const [a, b, c] = env.levels;
  assert.equal(levelAt(env, 0), a);
  assert.equal(levelAt(env, 0.04), a);
  assert.equal(levelAt(env, 0.05), b);
  assert.equal(levelAt(env, 0.1199), c);
  // Past the envelope's own covered length (3 * 0.05 = 0.15 s): the last sample, never extrapolated.
  assert.equal(levelAt(env, 0.15), c);
  assert.equal(levelAt(env, 1000), c);
});

test("createEnvelopeCache: level() is 0 before the load resolves, the real value after", async () => {
  let resolve!: (env: Envelope | null) => void;
  const loads: string[] = [];
  const cache = createEnvelopeCache((ref) => {
    loads.push(ref);
    return new Promise((r) => (resolve = r));
  });
  assert.equal(cache.level("a", 0), 0);
  assert.equal(cache.ready("a"), false);
  assert.equal(cache.unavailable("a"), false);
  resolve({ levels: Float32Array.from([0.5]), window: 1 });
  // Let the promise's .then settle before asserting the cached result.
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(cache.level("a", 0), 0.5);
  assert.equal(cache.ready("a"), true);
  assert.equal(cache.unavailable("a"), false);
  assert.deepEqual(loads, ["a"]);
});

test("createEnvelopeCache: a null resolution (undecodable) reads as silence forever, marked unavailable", async () => {
  const cache = createEnvelopeCache(async () => null);
  assert.equal(cache.level("a", 0), 0);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(cache.level("a", 5), 0);
  assert.equal(cache.ready("a"), false);
  assert.equal(cache.unavailable("a"), true);
});

test("createEnvelopeCache: the loader runs at most once per ref, however many times level()/ready() are called", async () => {
  let calls = 0;
  const cache = createEnvelopeCache(async (ref) => {
    calls++;
    return { levels: Float32Array.from([ref.length / 10]), window: 1 };
  });
  cache.level("a", 0);
  cache.level("a", 1);
  cache.ready("a");
  cache.unavailable("a");
  await Promise.resolve();
  await Promise.resolve();
  cache.level("a", 2);
  cache.ready("a");
  assert.equal(calls, 1);
});

test("createEnvelopeCache: two different refs are cached independently", async () => {
  const levelFor = (ref: string) => Float32Array.from([ref === "a" ? 0.1 : 0.9])[0];
  const cache = createEnvelopeCache(async (ref) => ({ levels: Float32Array.from([levelFor(ref)]), window: 1 }));
  cache.level("a", 0);
  cache.level("b", 0);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(cache.level("a", 0), levelFor("a"));
  assert.equal(cache.level("b", 0), levelFor("b"));
  assert.equal(cache.ready("a"), true);
  assert.equal(cache.ready("b"), true);
});
