// The mixer (spec 01, 01.5): one balance between narration and the bed, a master volume, and "duck under voice".
// Pure, so `node --test` runs it: the book's Mix with its defaults and clamps, the gain math that turns balance and
// master into the narration's and the bed's volume (composed with the bed's crossfade gain), and the duck: a voice
// detector over the narration's level with a hangover, and an envelope that dips the bed and brings it back.
//
// The narration's audio is only measured here, never kept or sent anywhere (agents.md rule 6): a level in, a
// gain out.
import { DEFAULT_BED, normalizeBed, type BedChoice, type BedSetting } from "./bed.ts";

/**
 * A book's mixer setting, saved per book (A10): the levels, and (01.7, A12) the layer: the book's soundscape or off,
 * and any chapter's own (src/lib/bed.ts BedSetting).
 */
export type Mix = BedSetting & {
  /** -1 narration only, 0 both at full, +1 the bed only. */
  balance: number;
  /** 0 silent to 1 full, over both layers. */
  master: number;
  /** Dip the bed while the narrator speaks (A11). */
  duck: boolean;
};

/** The part of a Mix that sets the two layers' volumes. */
export type MixLevels = Pick<Mix, "balance" | "master" | "duck">;

/**
 * The bed sits under the narration at 60% until the listener moves the balance; master full; duck off (opt-in); Night
 * Wind under every chapter.
 */
export const DEFAULT_MIX: Mix = { balance: -0.4, master: 1, duck: false, ...DEFAULT_BED };

/** One step of the balance and master sliders (keyboard and screen-reader increments). */
export const MIX_STEP = 0.1;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A Mix from anything stored: missing or broken fields take the default, numbers are clamped and rounded. A mix with
 * no layer of its own takes `fallbackBed` (the default soundscape setting, 06.3).
 */
export function normalizeMix(raw: unknown, fallbackBed?: BedChoice): Mix {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Mix, unknown>>;
  const num = (v: unknown, fallback: number, lo: number, hi: number) =>
    typeof v === "number" && Number.isFinite(v) ? round(clamp(v, lo, hi)) : fallback;
  return {
    balance: num(r.balance, DEFAULT_MIX.balance, -1, 1),
    master: num(r.master, DEFAULT_MIX.master, 0, 1),
    duck: typeof r.duck === "boolean" ? r.duck : DEFAULT_MIX.duck,
    ...normalizeBed(raw, fallbackBed),
  };
}

/**
 * The narration's and the bed's levels (0 to 1) for a Mix. The balance only ever turns one side down: left of
 * centre lowers the bed, right of centre lowers the narration, and the centre leaves both at full. Master scales both.
 */
export function mixLevels(mix: MixLevels): { narration: number; bed: number } {
  const m = normalizeMix(mix);
  const narration = m.balance > 0 ? 1 - m.balance : 1;
  const bed = m.balance < 0 ? 1 + m.balance : 1;
  return { narration: round(narration * m.master), bed: round(bed * m.master) };
}

/** A bed deck's volume: the mix's bed level, times its crossfade gain, times the duck's gain. */
export function bedVolume(level: number, crossfadeGain: number, duckGain: number = 1): number {
  const v = clamp(level, 0, 1) * clamp(crossfadeGain, 0, 1) * clamp(duckGain, 0, 1);
  return Math.round(v * 1e6) / 1e6;
}

/** The balance as a screen reader reads it: "Narration 100%, layer 60%". */
export function balanceText(mix: MixLevels): string {
  const { balance } = normalizeMix(mix);
  const narration = Math.round((balance > 0 ? 1 - balance : 1) * 100);
  const bed = Math.round((balance < 0 ? 1 + balance : 1) * 100);
  return `Narration ${narration}%, layer ${bed}%`;
}

/** A level as a percentage: "80%". */
export function percentText(level: number): string {
  return `${Math.round(clamp(level, 0, 1) * 100)}%`;
}

// ---- Duck under voice (A11) -------------------------------------------------------------------------------

/** The narration's RMS level at or above which the narrator counts as speaking (about -42 dBFS). */
export const VOICE_THRESHOLD = 0.008;
/** How long the voice stays "on" after the level drops, so the short gaps between words do not pump the bed. */
export const VOICE_HANGOVER_MS = 350;
/** The bed's gain while the narrator speaks. */
export const DUCK_GAIN = 0.35;
/** Time constants of the envelope: quick to dip under a voice, slower to come back in a pause. */
export const DUCK_ATTACK_MS = 120;
export const DUCK_RELEASE_MS = 500;
/** Longest step the envelope takes at once: a stalled sampler resumes smoothly instead of jumping. */
const MAX_STEP_MS = 250;

/** The root-mean-square level of one block of samples (-1 to 1). */
export function rms(frames: ArrayLike<number>): number {
  if (frames.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frames.length; i++) {
    const s = frames[i];
    if (Number.isFinite(s)) sum += s * s;
  }
  return Math.sqrt(sum / frames.length);
}

/** The voice detector's state: speaking or not, and when the level was last over the threshold. */
export type Voice = { active: boolean; lastAt: number | null };

export const SILENT: Voice = { active: false, lastAt: null };

/** The detector's next state for a level heard at `now` (ms): over the threshold is voice; under it, the hangover. */
export function detectVoice(prev: Voice, level: number, now: number): Voice {
  if (level >= VOICE_THRESHOLD) return { active: true, lastAt: now };
  const active = prev.lastAt !== null && now - prev.lastAt < VOICE_HANGOVER_MS;
  return { active, lastAt: prev.lastAt };
}

/**
 * The duck's gain after `dtMs`: an exponential approach to DUCK_GAIN while the voice is on (attack) and to 1 in
 * the pauses (release). Duck off always answers 1.
 */
export function duckStep(gain: number, voice: boolean, dtMs: number, enabled: boolean = true): number {
  if (!enabled) return 1;
  const target = voice ? DUCK_GAIN : 1;
  const tau = target < gain ? DUCK_ATTACK_MS : DUCK_RELEASE_MS;
  const dt = clamp(Number.isFinite(dtMs) ? dtMs : 0, 0, MAX_STEP_MS);
  const next = target + (clamp(gain, 0, 1) - target) * Math.exp(-dt / tau);
  return Math.abs(next - target) < 0.002 ? target : Math.round(next * 1e4) / 1e4;
}

/** The duck as one object for the engine: feed it the narration's samples, read the bed's gain. */
export function createDucker() {
  let voice: Voice = SILENT;
  let gain = 1;
  let last: number | null = null;
  return {
    /** One block of the narration's samples heard at `now` (ms); returns the bed's duck gain. */
    hear(frames: ArrayLike<number>, now: number, enabled: boolean): number {
      voice = detectVoice(voice, rms(frames), now);
      gain = duckStep(gain, voice.active, last === null ? 0 : now - last, enabled);
      last = now;
      return gain;
    },
    /** Back to un-ducked (duck off, a pause, a new book). */
    reset(): number {
      voice = SILENT;
      gain = 1;
      last = null;
      return gain;
    },
    gain: () => gain,
  };
}
