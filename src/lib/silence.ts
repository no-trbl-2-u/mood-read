// Chapter breaks from silences (spec 01 A6), for a single file with no chapter markers. The audio is reduced to
// an amplitude envelope (RMS per short window) on the device and never leaves it (agents.md rule 6). A break
// sits in the middle of each long silence, and breaks that would leave a very short chapter are dropped: the
// listener merges or splits from there. Pure, so `node --test` runs it.
import { ascii, type ByteSource } from "./meta/bytes.ts";
import { parseFmt, wavChunks } from "./meta/riff.ts";

export type Envelope = { levels: Float32Array; window: number };

export type SilenceOptions = {
  /** A silence must last this long to break a chapter (seconds). */
  minSilence: number;
  /** No chapter shorter than this (seconds). */
  minChapter: number;
  /** How far under the speech level counts as silence (dB). */
  below: number;
};

export const SILENCE_DEFAULTS: SilenceOptions = { minSilence: 2, minChapter: 60, below: 30 };
export const ENVELOPE_WINDOW = 0.05;

/** Accumulates samples (any rate, mixed to mono) into an RMS envelope. */
export function envelopeBuilder(sampleRate: number, window = ENVELOPE_WINDOW) {
  const per = Math.max(1, Math.round(sampleRate * window));
  const levels: number[] = [];
  let sum = 0;
  let n = 0;
  return {
    push(sample: number) {
      sum += sample * sample;
      if (++n === per) {
        levels.push(Math.sqrt(sum / n));
        sum = 0;
        n = 0;
      }
    },
    done(): Envelope {
      if (n > 0) levels.push(Math.sqrt(sum / n));
      return { levels: Float32Array.from(levels), window: per / sampleRate };
    },
  };
}

/** The envelope of decoded PCM (channels of samples in -1..1), mixed to mono. */
export function envelopeFromPcm(channels: Float32Array[], sampleRate: number, window = ENVELOPE_WINDOW): Envelope {
  const b = envelopeBuilder(sampleRate, window);
  const len = channels[0]?.length ?? 0;
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (const ch of channels) s += ch[i];
    b.push(s / channels.length);
  }
  return b.done();
}

const toDb = (x: number) => 20 * Math.log10(x + 1e-9);

/** Spans (seconds) where the envelope stays quiet for at least `minSilence`. */
export function findSilences(env: Envelope, opts: Partial<SilenceOptions> = {}): { start: number; end: number }[] {
  const o = { ...SILENCE_DEFAULTS, ...opts };
  const n = env.levels.length;
  if (n === 0) return [];
  const db = Array.from(env.levels, toDb);
  const sorted = [...db].sort((a, b) => a - b);
  const speech = sorted[Math.floor(0.95 * (n - 1))];
  // Quiet relative to the speech level, never above -35 dBFS and never so low that hiss reads as voice.
  const threshold = Math.max(-70, Math.min(-35, speech - o.below));
  const out: { start: number; end: number }[] = [];
  let from = -1;
  for (let i = 0; i <= n; i++) {
    const quiet = i < n && db[i] < threshold;
    if (quiet && from < 0) from = i;
    if (!quiet && from >= 0) {
      const start = from * env.window;
      const end = i * env.window;
      if (end - start >= o.minSilence) out.push({ start, end });
      from = -1;
    }
  }
  return out;
}

/** Where to break chapters: the middle of each long silence, keeping every chapter at least `minChapter` long. */
export function silenceBreaks(env: Envelope, duration: number, opts: Partial<SilenceOptions> = {}): number[] {
  const o = { ...SILENCE_DEFAULTS, ...opts };
  const breaks: number[] = [];
  let last = 0;
  for (const s of findSilences(env, o)) {
    // Silence at the very start or end is lead-in and run-out, not a break.
    if (s.start <= 0 || s.end >= duration) continue;
    const mid = (s.start + s.end) / 2;
    if (mid - last >= o.minChapter && duration - mid >= o.minChapter) {
      breaks.push(mid);
      last = mid;
    }
  }
  return breaks;
}

/** Streams a PCM WAV's data chunk into an envelope, a block at a time; null for anything but 8/16/24/32-bit PCM or float. */
export async function wavEnvelope(source: ByteSource, window = ENVELOPE_WINDOW, block = 1 << 20): Promise<Envelope | null> {
  const chunks = await wavChunks(source);
  const fmtChunk = chunks.find((c) => c.id === "fmt ");
  const data = chunks.find((c) => c.id === "data");
  if (!fmtChunk || !data) return null;
  const fmt = parseFmt(await source.read(fmtChunk.offset, fmtChunk.size));
  const bytes = fmt.bits / 8;
  if (fmt.rate <= 0 || fmt.channels <= 0 || ![1, 2, 3, 4].includes(bytes)) return null;
  if (fmt.format !== 1 && !(fmt.format === 3 && bytes === 4)) return null;
  const frame = bytes * fmt.channels;
  const b = envelopeBuilder(fmt.rate, window);
  const step = Math.max(frame, block - (block % frame));
  for (let at = 0; at < data.size; at += step) {
    const p = await source.read(data.offset + at, Math.min(step, data.size - at));
    const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
    for (let o = 0; o + frame <= p.length; o += frame) {
      let s = 0;
      for (let ch = 0; ch < fmt.channels; ch++) {
        const k = o + ch * bytes;
        if (fmt.format === 3) s += view.getFloat32(k, true);
        else if (bytes === 1) s += (p[k] - 128) / 128;
        else if (bytes === 2) s += view.getInt16(k, true) / 32768;
        else if (bytes === 3) s += (((p[k] | (p[k + 1] << 8) | (p[k + 2] << 16)) << 8) >> 8) / 8388608;
        else s += view.getInt32(k, true) / 2147483648;
      }
      b.push(s / fmt.channels);
    }
  }
  return b.done();
}

/** True for a WAV source (the one format the phone can turn into an envelope without a decoder). */
export async function isWav(source: ByteSource): Promise<boolean> {
  const h = await source.read(0, 12);
  return ascii(h, 0) === "RIFF" && ascii(h, 8) === "WAVE";
}

// ---- Reading an envelope back by position (Android's duck cue, 01.28) ------------------------------------

/** The envelope's level (0 to 1, an RMS value) at a file-local time in seconds; 0 for no envelope, a negative
 *  time, or past the envelope's own length (never guessed past what was decoded). */
export function levelAt(env: Envelope | null, seconds: number): number {
  if (!env || env.levels.length === 0 || env.window <= 0 || !(seconds >= 0)) return 0;
  const i = Math.min(env.levels.length - 1, Math.floor(seconds / env.window));
  return env.levels[i];
}

export type EnvelopeLoader = (ref: string) => Promise<Envelope | null>;

/**
 * One file's envelope at a time, loaded once and cached, for Android's duck cue (01.28): there is no live,
 * permission-free mic tap on Android, so the level comes from this file's own pre-decoded envelope instead,
 * read at the playing position. A file this phone can't decode (anything but WAV today) caches `null` and
 * reads as silence forever — the duck just stays off for it, the same as before this existed.
 */
export function createEnvelopeCache(load: EnvelopeLoader) {
  const cache = new Map<string, Envelope | null | Promise<Envelope | null>>();
  function entry(ref: string): Envelope | null | Promise<Envelope | null> {
    const got = cache.get(ref);
    if (got !== undefined) return got;
    const pending = load(ref).then((env) => {
      cache.set(ref, env);
      return env;
    });
    cache.set(ref, pending);
    return pending;
  }
  return {
    /** The level at this file's offset (seconds); 0 while its envelope is still loading or can't be decoded. */
    level(ref: string, offsetSeconds: number): number {
      const got = entry(ref);
      return got instanceof Promise ? 0 : levelAt(got, offsetSeconds);
    },
    /** True once this file's envelope has loaded and decoded (false while pending, absent, or undecodable). */
    ready(ref: string): boolean {
      const got = cache.get(ref);
      return got !== undefined && !(got instanceof Promise) && got !== null;
    },
    /** True once this file's envelope has loaded but could NOT be decoded (so the duck honestly stays off). */
    unavailable(ref: string): boolean {
      const got = cache.get(ref);
      return got !== undefined && !(got instanceof Promise) && got === null;
    },
  };
}
