// The bed: the second audio layer under the narration (spec 01, Contracts: one audio engine, two layers). Pure
// decisions only, so `node --test` runs them: which sound a chapter gets (01.7: the chapter's own pick, else the
// book's), what the bed does on each clock event, where in its loop it sits, and the crossfade's gain curve.
// src/player/bed-engine.ts carries them out.
//
// The narration owns the clock: play, pause, seek and chapter change drive the bed; nothing here reports back.
// The narration's speed is read only to be ignored: the bed always plays at BED_RATE, never sped up or
// pitch-shifted (A9).
import type { ClockEvent, ClockState } from "./clock.ts";
import { DEFAULT_SOUNDSCAPE_ID } from "./soundscapes.ts";

/** The bed's playback rate, whatever the narration's speed (A9). */
export const BED_RATE = 1;
/** How long a chapter-boundary crossfade takes (ms). */
export const CROSSFADE_MS = 2000;

/** What the bed carries: a soundscape (v1), the chapter's piece (01.10, plays nothing yet) or nothing. */
export type BedLayer = "soundscape" | "music" | "off";

/** One choice of what the bed plays (spec 01, Contracts: Mix's layer and soundscape id). */
export type BedChoice = {
  layer: BedLayer;
  /** The soundscape when the layer is one; null otherwise. */
  soundscapeId: string | null;
};

/**
 * A book's bed, saved in its Mix (01.7, A12): the book's choice, and the chapters that have their own, keyed by
 * chapter index. A chapter's own choice wins over the book's.
 */
export type BedSetting = BedChoice & { chapterBeds: Record<string, BedChoice> };

/** A new book: Night Wind under every chapter, no chapter of its own. */
export const DEFAULT_BED: BedSetting = { layer: "soundscape", soundscapeId: DEFAULT_SOUNDSCAPE_ID, chapterBeds: {} };

/** A pick from the mixer's layer chips: "off", or a soundscape id. */
export type LayerPick = "off" | string;

const LAYERS: readonly BedLayer[] = ["soundscape", "music", "off"];

/** A BedChoice from anything stored, or null when it is not one. */
export function normalizeBedChoice(raw: unknown): BedChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof BedChoice, unknown>>;
  if (!LAYERS.includes(r.layer as BedLayer)) return null;
  const layer = r.layer as BedLayer;
  if (layer !== "soundscape") return { layer, soundscapeId: null };
  return { layer, soundscapeId: typeof r.soundscapeId === "string" && r.soundscapeId ? r.soundscapeId : DEFAULT_SOUNDSCAPE_ID };
}

/** A BedSetting from anything stored (a mix saved before 01.7 has none): broken parts take the default. */
export function normalizeBed(raw: unknown): BedSetting {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof BedSetting, unknown>>;
  const book = normalizeBedChoice(r) ?? DEFAULT_BED;
  const chapterBeds: Record<string, BedChoice> = {};
  if (r.chapterBeds && typeof r.chapterBeds === "object") {
    for (const [key, value] of Object.entries(r.chapterBeds as Record<string, unknown>)) {
      const choice = normalizeBedChoice(value);
      if (choice && /^\d+$/.test(key)) chapterBeds[String(Number(key))] = choice;
    }
  }
  return { layer: book.layer, soundscapeId: book.soundscapeId, chapterBeds };
}

/** The chapter's own choice, or null when it follows the book's. */
export function chapterBed(setting: BedSetting, chapterIndex: number | null): BedChoice | null {
  if (chapterIndex === null) return null;
  return setting.chapterBeds?.[String(chapterIndex)] ?? null;
}

/** The choice that applies to a chapter: its own, else the book's. */
export function choiceFor(chapterIndex: number | null, setting: BedSetting | BedChoice): BedChoice {
  const own = "chapterBeds" in setting ? chapterBed(setting, chapterIndex) : null;
  return own ?? { layer: setting.layer, soundscapeId: setting.soundscapeId };
}

/**
 * The sound for a chapter, or null for silence: the chapter's own choice, else the book's (A12). A soundscape no
 * longer bundled falls back to the default one, then to the catalog's first; off and music (until 01.10) play nothing.
 */
export function bedSoundFor(
  chapterIndex: number | null,
  setting: BedSetting | BedChoice,
  catalog: readonly string[],
): string | null {
  if (catalog.length === 0 || chapterIndex === null) return null;
  const choice = choiceFor(chapterIndex, setting);
  if (choice.layer !== "soundscape") return null;
  if (choice.soundscapeId && catalog.includes(choice.soundscapeId)) return choice.soundscapeId;
  return catalog.includes(DEFAULT_SOUNDSCAPE_ID) ? DEFAULT_SOUNDSCAPE_ID : catalog[0];
}

/** The chip that is on for a chapter: "off", a soundscape id, or null (the music layer has no chip until 01.10). */
export function pickFor(chapterIndex: number | null, setting: BedSetting, catalog: readonly string[]): LayerPick | null {
  const choice = choiceFor(chapterIndex, setting);
  if (choice.layer === "off") return "off";
  if (choice.layer === "music") return null;
  return bedSoundFor(chapterIndex ?? 0, setting, catalog);
}

const choiceOf = (pick: LayerPick): BedChoice =>
  pick === "off" ? { layer: "off", soundscapeId: null } : { layer: "soundscape", soundscapeId: pick };

/**
 * A pick from the layer chips: it sets the chapter's own choice when that chapter has one ("This chapter only" on),
 * otherwise the book's, which every chapter without its own follows.
 */
export function pickLayer(setting: BedSetting, chapterIndex: number | null, pick: LayerPick): BedSetting {
  const choice = choiceOf(pick);
  if (chapterBed(setting, chapterIndex)) {
    return { ...setting, chapterBeds: { ...setting.chapterBeds, [String(chapterIndex)]: choice } };
  }
  return { ...setting, ...choice };
}

/**
 * "This chapter only": on gives the chapter its own choice, starting as what it plays now (nothing changes until
 * the next pick); off drops it, so the chapter follows the book's again.
 */
export function setChapterOnly(setting: BedSetting, chapterIndex: number | null, on: boolean): BedSetting {
  if (chapterIndex === null || on === !!chapterBed(setting, chapterIndex)) return setting;
  const chapterBeds = { ...setting.chapterBeds };
  if (on) chapterBeds[String(chapterIndex)] = choiceFor(chapterIndex, setting);
  else delete chapterBeds[String(chapterIndex)];
  return { ...setting, chapterBeds };
}

/** Where the loop sits for a narration position: the time into the chapter, wrapped by the loop's length. */
export function bedOffset(position: number, chapterStart: number, loopSeconds: number): number {
  if (!(loopSeconds > 0) || !Number.isFinite(position)) return 0;
  const into = Math.max(0, position - chapterStart);
  return into % loopSeconds;
}

/** Equal-power crossfade gains at `elapsedMs` into a fade of `durationMs`: the incoming rises as the outgoing falls. */
export function crossfadeGains(elapsedMs: number, durationMs: number = CROSSFADE_MS): { in: number; out: number } {
  const t = durationMs > 0 ? Math.min(1, Math.max(0, elapsedMs / durationMs)) : 1;
  const inGain = Math.sin((t * Math.PI) / 2);
  const outGain = Math.cos((t * Math.PI) / 2);
  return { in: round(inGain), out: round(outGain) };
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** What the bed is doing now. */
export type BedState = { soundId: string | null; playing: boolean };

export const IDLE_BED: BedState = { soundId: null, playing: false };

/**
 * One instruction for the engine. `change` moves to another sound (null: silence) at `offset` in its loop,
 * crossfading when the bed is heard before and after; `seek` moves within the same loop.
 */
export type BedCommand =
  | { type: "change"; to: string | null; offset: number; play: boolean; fade: boolean }
  | { type: "seek"; offset: number }
  | { type: "play" }
  | { type: "pause" };

export type BedContext = {
  /** The start (book seconds) of the chapter the clock is in. */
  chapterStart: number;
  /** The sound for a chapter (see bedSoundFor). */
  soundFor: (chapterIndex: number | null) => string | null;
  /** A sound's loop length in seconds. */
  loopSeconds: (soundId: string) => number;
};

/**
 * The bed's next state and what to do, given the narration clock's new state and event. Speed never appears in a
 * command: a "rate" event changes nothing (A9).
 */
export function planBed(
  prev: BedState,
  clock: ClockState,
  event: ClockEvent,
  ctx: BedContext,
): { state: BedState; commands: BedCommand[] } {
  const soundId = clock.bookId ? ctx.soundFor(clock.chapterIndex) : null;
  const playing = clock.playing && soundId !== null;
  const offset = soundId ? bedOffset(clock.position, ctx.chapterStart, ctx.loopSeconds(soundId)) : 0;
  const state: BedState = { soundId, playing };

  if (soundId !== prev.soundId) {
    // Heard before and after: crossfade. Silent on either side: switch, fading out what was playing.
    const fade = prev.playing && (playing || soundId === null);
    return { state, commands: [{ type: "change", to: soundId, offset, play: playing, fade }] };
  }

  const commands: BedCommand[] = [];
  if (soundId !== null && (event === "seek" || event === "load")) commands.push({ type: "seek", offset });
  if (playing !== prev.playing) commands.push({ type: playing ? "play" : "pause" });
  return { state, commands };
}
