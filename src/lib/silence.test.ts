// Spec 01 A6: chapter breaks from detected silences, over an envelope from decoded PCM or a streamed WAV.
import assert from "node:assert/strict";
import { test } from "node:test";

import { memorySource } from "./meta/bytes.ts";
import { toneAndSilence, wavFile } from "./meta/test-fixtures.ts";
import { envelopeFromPcm, findSilences, silenceBreaks, wavEnvelope } from "./silence.ts";

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
