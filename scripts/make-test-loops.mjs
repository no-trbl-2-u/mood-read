// Writes the bed's placeholder loops (01.3) into assets/soundscapes/: quiet synthetic tones, made here from sine
// waves, so they are this project's own work with no third-party license (agents.md rule 6). Every partial and the
// slow swell complete whole cycles in the loop's length, so each file loops without a seam. 01.7's licensed
// soundscapes replace them.
// Usage: node scripts/make-test-loops.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 16000;
const SECONDS = 4;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'soundscapes');

/** Each loop: partials as [Hz, level], a swell rate in Hz; all are whole multiples of 1 / SECONDS. */
const LOOPS = {
  'test-low-hum.wav': { partials: [[110, 1], [165, 0.5], [220, 0.25]], swell: 0.25 },
  'test-drift.wav': { partials: [[196, 1], [294, 0.6], [392, 0.2]], swell: 0.5 },
};

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(s * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, { partials, swell }] of Object.entries(LOOPS)) {
  const total = partials.reduce((sum, [, level]) => sum + level, 0);
  const n = RATE * SECONDS;
  const samples = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const tone = partials.reduce((sum, [hz, level]) => sum + level * Math.sin(2 * Math.PI * hz * t), 0) / total;
    const env = 0.75 + 0.25 * Math.sin(2 * Math.PI * swell * t);
    samples[i] = 0.12 * env * tone;
  }
  writeFileSync(path.join(OUT, name), wav(samples));
  console.log(`wrote assets/soundscapes/${name}`);
}
