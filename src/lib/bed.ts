// The bed: the second audio layer under the narration (spec 01, Contracts: one audio engine, two layers). Pure
// decisions only, so `node --test` runs them: which sound a chapter gets, what the bed does on each clock event,
// where in its loop it sits, and the crossfade's gain curve. src/player/bed-engine.ts carries them out.
//
// The narration owns the clock: play, pause, seek and chapter change drive the bed; nothing here reports back.
// The narration's speed is read only to be ignored: the bed always plays at BED_RATE, never sped up or
// pitch-shifted (A9).
import type { ClockEvent, ClockState } from "./clock.ts";

/** The bed's playback rate, whatever the narration's speed (A9). */
export const BED_RATE = 1;
/** How long a chapter-boundary crossfade takes (ms). */
export const CROSSFADE_MS = 2000;

/** What the bed carries: a soundscape (v1), the chapter's piece (01.10, plays nothing yet) or nothing. */
export type BedLayer = "soundscape" | "music" | "off";

/** The part of a book's Mix (spec 01, Contracts) the bed reads; the mixer (01.5) adds the levels. */
export type BedChoice = {
  layer: BedLayer;
  /** One soundscape for the whole book, or null for each chapter's own (until 01.7, a rotation of test loops). */
  soundscapeId: string | null;
};

export const DEFAULT_BED: BedChoice = { layer: "soundscape", soundscapeId: null };

/**
 * The sound for a chapter, or null for silence. A book-wide soundscape wins; otherwise chapters take the
 * catalog in turn, so neighbouring chapters differ and a boundary is heard as a crossfade (A8).
 */
export function bedSoundFor(chapterIndex: number | null, choice: BedChoice, catalog: readonly string[]): string | null {
  if (choice.layer !== "soundscape" || catalog.length === 0 || chapterIndex === null) return null;
  if (choice.soundscapeId && catalog.includes(choice.soundscapeId)) return choice.soundscapeId;
  return catalog[((chapterIndex % catalog.length) + catalog.length) % catalog.length];
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
