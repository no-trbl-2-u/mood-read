// The six ambient soundscapes (spec 01, 01.7), synthesized here from seeded noise, filters and simple tones. Nothing
// is sampled or downloaded: every loop is this project's own work, so no third-party license applies (agents.md
// rule 6, A18). scripts/make-soundscapes.mjs writes them into assets/soundscapes/.
//
// Each loop is truly periodic, so it wraps without a seam:
// - every slow modulation completes a whole number of cycles in the loop's length;
// - every filter runs circularly: one full pass over the loop to settle its state, then the pass that is kept, so the
//   filter's state at the end of the loop is the state its start was made from;
// - every one-off event (a droplet, a crackle, a syllable, a clink) is written modulo the loop's length, so one that
//   starts near the end finishes at the start.
// scripts/__tests__/soundscapes.test.mjs checks the boundary of each written file.

import { Buffer } from "node:buffer";

/** Sample rate of the written loops: a quiet bed under speech needs little above 8 kHz, and it keeps them small. */
export const RATE = 16000;
/** Every loop's length in seconds. */
export const SECONDS = 24;
/** Samples in one loop. */
export const N = RATE * SECONDS;
/** Each loop's RMS level (about -27 dBFS): soft, and the same for all six, so switching keeps the bed's loudness. */
export const TARGET_RMS = 0.045;
/** The soft limiter's ceiling: transients round off under it instead of clipping. */
const CEILING = 0.5;

const TAU = 2 * Math.PI;

/** A seeded PRNG (mulberry32): the same seed writes the same loop, byte for byte. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r, lo, hi) => lo + (hi - lo) * r();

/** White noise in [-1, 1]. */
function white(r, n = N) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  return x;
}

/** A slow periodic modulation: the sum of sines with whole cycles per loop ([cycles, depth, phase]). */
function lfo(i, parts) {
  let v = 0;
  for (const [cycles, depth, phase = 0] of parts) v += depth * Math.sin((TAU * cycles * i) / N + phase);
  return v;
}

/** RBJ biquad coefficients, normalized by a0. */
function coefs(type, f, q) {
  const w = (TAU * Math.min(f, RATE * 0.45)) / RATE;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  let b0, b1, b2;
  if (type === "lp") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === "hp") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha];
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
}

/**
 * A biquad run circularly over a whole loop: a settling pass, then the kept pass. `freq` is a number or a function of
 * the sample index; a function must be periodic in N (it is called with i in [0, N)).
 */
function filter(x, type, freq, q = Math.SQRT1_2) {
  const n = x.length;
  const out = new Float32Array(n);
  const fixed = typeof freq === "number" ? coefs(type, freq, q) : null;
  let c = fixed;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      if (!fixed && i % 16 === 0) c = coefs(type, freq(i), q);
      const [b0, b1, b2, a1, a2] = c;
      const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x[i];
      y2 = y1;
      y1 = y;
      if (pass === 1) out[i] = y;
    }
  }
  return out;
}

/** A one-pole lowpass run circularly (the leaky integrator that turns white noise brown). */
function onePole(x, f) {
  const k = 1 - Math.exp((-TAU * f) / RATE);
  const out = new Float32Array(x.length);
  let y = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < x.length; i++) {
      y += k * (x[i] - y);
      if (pass === 1) out[i] = y;
    }
  }
  return out;
}

/** Pink noise (Paul Kellet's filter over white), run circularly. */
function pink(r) {
  const w = white(r);
  const out = new Float32Array(N);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      const v = w[i];
      b0 = 0.99886 * b0 + v * 0.0555179;
      b1 = 0.99332 * b1 + v * 0.0750759;
      b2 = 0.969 * b2 + v * 0.153852;
      b3 = 0.8665 * b3 + v * 0.3104856;
      b4 = 0.55 * b4 + v * 0.5329522;
      b5 = -0.7616 * b5 - v * 0.016898;
      const p = b0 + b1 + b2 + b3 + b4 + b5 + b6 + v * 0.5362;
      b6 = v * 0.115926;
      if (pass === 1) out[i] = p * 0.11;
    }
  }
  return out;
}

/** Adds a short sound at `start`, wrapping past the loop's end to its start. */
function place(buf, start, sound, gain = 1) {
  const s = ((Math.round(start) % N) + N) % N;
  for (let j = 0; j < sound.length; j++) buf[(s + j) % N] += gain * sound[j];
}

/** A damped sine (a droplet's ring, a pop, a clink partial), optionally gliding in pitch. */
function ring(freq, decaySeconds, seconds, glide = 0) {
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n);
  let phase = 0;
  for (let j = 0; j < n; j++) {
    const t = j / RATE;
    phase += (TAU * freq * (1 + glide * (t / seconds))) / RATE;
    const attack = Math.min(1, j / 8);
    out[j] = attack * Math.exp(-t / decaySeconds) * Math.sin(phase);
  }
  return out;
}

/** A short burst of noise with an exponential tail (a crackle). */
function burst(r, decaySeconds, seconds) {
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n);
  for (let j = 0; j < n; j++) out[j] = (r() * 2 - 1) * Math.exp(-j / RATE / decaySeconds) * Math.min(1, j / 3);
  return out;
}

/** Times (sample indices) of a Poisson process at `perSecond` across the loop. */
function poisson(r, perSecond) {
  const out = [];
  let t = -Math.log(1 - r()) / perSecond;
  while (t < SECONDS) {
    out.push(Math.floor(t * RATE));
    t += -Math.log(1 - r()) / perSecond;
  }
  return out;
}

function mix(...layers) {
  const out = new Float32Array(N);
  for (const [x, g] of layers) for (let i = 0; i < N; i++) out[i] += g * x[i];
  return out;
}

const rmsOf = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

/** DC and sub-bass out (circular), every loop to TARGET_RMS, peaks rounded under CEILING (memoryless, so still periodic). */
function finish(x) {
  const clean = filter(x, "hp", 35);
  const g = TARGET_RMS / rmsOf(clean);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = CEILING * Math.tanh((clean[i] * g) / CEILING);
  return out;
}

// ---- The six ---------------------------------------------------------------------------------------------------

/** Rain: a hiss of distant rain, a soft body under it, and many small droplets (rising pitched blips). */
function rain() {
  const r = rng(101);
  const swell = (i) => 1 + lfo(i, [[1, 0.12], [3, 0.06, 1.3]]);
  const hiss = filter(filter(white(r), "hp", 900), "lp", 5200);
  const body = filter(filter(white(r), "lp", 700), "hp", 120);
  const drops = new Float32Array(N);
  for (const at of poisson(r, 38)) {
    const f = between(r, 1800, 5200);
    place(drops, at, ring(f, between(r, 0.004, 0.012), 0.04, between(r, 0.1, 0.6)), between(r, 0.02, 0.12));
  }
  for (const at of poisson(r, 2.5)) {
    const f = between(r, 900, 2000);
    place(drops, at, ring(f, between(r, 0.01, 0.025), 0.08, between(r, 0.2, 0.8)), between(r, 0.08, 0.2));
  }
  const bed = mix([hiss, 0.22], [body, 0.6], [filter(drops, "lp", 6000), 2.6]);
  for (let i = 0; i < N; i++) bed[i] *= swell(i);
  return finish(bed);
}

/** Hearth fire: a brown-noise rumble with a slow flicker, a faint hiss, small crackles in clusters and a few pops. */
function hearthFire() {
  const r = rng(202);
  const rumble = filter(onePole(white(r), 25), "lp", 220);
  const flicker = (i) => 1 + lfo(i, [[2, 0.18], [5, 0.1, 0.7], [11, 0.06, 2.1]]);
  for (let i = 0; i < N; i++) rumble[i] *= flicker(i);
  const hiss = filter(filter(white(r), "hp", 2500), "lp", 6500);
  const crackle = new Float32Array(N);
  for (const at of poisson(r, 3)) {
    // A cluster: a few crackles close together.
    const count = 1 + Math.floor(r() * 5);
    let t = at;
    for (let k = 0; k < count; k++) {
      place(crackle, t, burst(r, between(r, 0.0006, 0.0025), 0.012), between(r, 0.2, 1));
      t += Math.floor(between(r, 0.01, 0.07) * RATE);
    }
  }
  const pops = new Float32Array(N);
  for (const at of poisson(r, 0.35)) place(pops, at, ring(between(r, 280, 750), between(r, 0.012, 0.03), 0.12), between(r, 0.3, 0.6));
  const bed = mix(
    [rumble, 5],
    [hiss, 0.06],
    [filter(crackle, "hp", 1200), 1.1],
    [filter(pops, "lp", 2500), 0.9],
  );
  return finish(bed);
}

/** Night wind: noise through a slowly swept resonant band, gusting, with a faint high whistle and a low rumble. */
function nightWind() {
  const r = rng(303);
  const gust = (i) => {
    const g = 0.55 + lfo(i, [[1, 0.3, 0.4], [2, 0.18, 1.9], [5, 0.08, 0.2]]);
    return Math.max(0.2, g);
  };
  const sweep = (i) => 420 * Math.exp(lfo(i, [[1, 0.45, 0.4], [3, 0.2, 2.6], [7, 0.08, 1.1]]));
  const src = pink(r);
  const band = filter(src, "bp", sweep, 3.5);
  const whistle = filter(src, "bp", (i) => sweep(i) * 2.7, 9);
  const low = filter(onePole(white(r), 40), "lp", 160);
  const bed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const g = gust(i);
    bed[i] = g * band[i] + 0.4 * g * g * whistle[i] + 1.5 * (0.5 + 0.5 * g) * low[i];
  }
  return finish(bed);
}

/** Tide: waves wash in and draw back, brighter at the crest, with a fizz as each recedes, over a low sea rumble. */
function tide() {
  const r = rng(404);
  // Four waves of different sizes at uneven starts across the loop; each envelope wraps past the end.
  const waves = [
    { start: 0.0, len: 7.0, size: 1 },
    { start: 6.2, len: 5.5, size: 0.7 },
    { start: 11.4, len: 7.5, size: 0.9 },
    { start: 18.2, len: 6.5, size: 0.8 },
  ];
  const env = new Float32Array(N);
  const fizzEnv = new Float32Array(N);
  for (const w of waves) {
    const n = Math.round(w.len * RATE);
    for (let j = 0; j < n; j++) {
      const u = j / n;
      // Rise over the first third (a smooth wash in), fall over the rest.
      const e = u < 0.35 ? Math.sin((Math.PI / 2) * (u / 0.35)) ** 2 : Math.cos((Math.PI / 2) * ((u - 0.35) / 0.65)) ** 1.5;
      const f = u < 0.3 ? 0 : Math.sin(Math.PI * ((u - 0.3) / 0.7)) ** 2;
      const k = (Math.round(w.start * RATE) + j) % N;
      env[k] += w.size * e;
      fizzEnv[k] += w.size * f;
    }
  }
  const cutoff = (i) => 350 + 2200 * Math.min(1, env[i]);
  const wash = filter(white(r), "lp", cutoff, 0.9);
  const fizz = filter(filter(white(r), "hp", 2600), "lp", 6500);
  const rumble = filter(onePole(white(r), 30), "lp", 180);
  const bed = new Float32Array(N);
  for (let i = 0; i < N; i++) bed[i] = (0.12 + env[i]) * wash[i] + 0.18 * fizzEnv[i] * fizz[i] + 5 * rumble[i];
  return finish(bed);
}

/** Static hush: soft pink noise, its top rolled off, breathing very slightly. */
function staticHush() {
  const r = rng(505);
  const p = filter(filter(pink(r), "lp", 3800), "hp", 60);
  for (let i = 0; i < N; i++) p[i] *= 1 + lfo(i, [[1, 0.05], [2, 0.03, 1]]);
  return finish(p);
}

/** Low café: a far murmur of formant-shaped noise syllables (no words, no voice, no melody), room tone, rare soft clinks. */
function lowCafe() {
  const r = rng(606);
  const murmur = new Float32Array(N);
  // Formant pairs (F1, F2) of vowel-like colours; noise through them reads as distant talk, never as words.
  const vowels = [[700, 1200], [500, 1800], [350, 2200], [450, 900], [600, 1600], [400, 1100]];
  for (let voice = 0; voice < 9; voice++) {
    const level = between(r, 0.4, 1);
    let t = r() * SECONDS;
    const end = t + SECONDS;
    while (t < end) {
      // A phrase of syllables, then a pause.
      const syllables = 3 + Math.floor(r() * 9);
      for (let s = 0; s < syllables && t < end; s++) {
        const len = between(r, 0.09, 0.24);
        const n = Math.round(len * RATE);
        const pre = 256;
        const exc = new Float32Array(n + pre);
        for (let j = 0; j < exc.length; j++) exc[j] = r() * 2 - 1;
        const [f1, f2] = vowels[Math.floor(r() * vowels.length)];
        const shift = between(r, 0.85, 1.2);
        const a = filterOnce(exc, f1 * shift, 6);
        const b = filterOnce(exc, f2 * shift, 8);
        const syl = new Float32Array(n);
        for (let j = 0; j < n; j++) syl[j] = Math.sin((Math.PI * j) / n) ** 2 * (a[j + pre] + 0.6 * b[j + pre]);
        place(murmur, t * RATE, syl, level * between(r, 0.6, 1));
        t += len + between(r, 0.01, 0.06);
      }
      t += between(r, 0.4, 2.2);
    }
  }
  const room = filter(pink(r), "lp", 500);
  const clinks = new Float32Array(N);
  for (const at of [2.7, 9.1, 15.8, 21.3].map((s) => s * RATE + between(r, -0.4, 0.4) * RATE)) {
    const base = between(r, 2100, 2900);
    const c = new Float32Array(Math.round(0.4 * RATE));
    for (const [ratio, amp] of [[1, 1], [1.58, 0.5], [2.37, 0.3]]) {
      const p = ring(base * ratio, between(r, 0.08, 0.16), 0.4);
      for (let j = 0; j < c.length; j++) c[j] += amp * p[j];
    }
    place(clinks, at, c, between(r, 0.05, 0.09));
  }
  const bed = mix([filter(murmur, "lp", 1800), 1], [room, 0.6], [clinks, 1]);
  return finish(bed);
}

/** A bandpass over a short excitation, not circular: a syllable is enveloped to zero at both ends. */
function filterOnce(x, f, q) {
  const [b0, b1, b2, a1, a2] = coefs("bp", f, q);
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/** The six, in the mixer's chip order, by file name. */
export const LOOPS = [
  { id: "rain", file: "rain.wav", render: rain },
  { id: "hearth-fire", file: "hearth-fire.wav", render: hearthFire },
  { id: "night-wind", file: "night-wind.wav", render: nightWind },
  { id: "tide", file: "tide.wav", render: tide },
  { id: "static-hush", file: "static-hush.wav", render: staticHush },
  { id: "low-cafe", file: "low-cafe.wav", render: lowCafe },
];

/** A mono 16-bit PCM WAV of `samples` (-1 to 1) at RATE. */
export function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
