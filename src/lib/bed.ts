// The bed: the second audio layer under the narration (spec 01, Contracts: one audio engine, two layers). Pure
// decisions only, so `node --test` runs them: which sound a chapter gets (01.7: the chapter's own pick, else the
// book's), what the bed does on each clock event, where in its loop it sits, and the crossfade's gain curve.
// src/player/bed-engine.ts carries them out.
//
// The narration owns the clock: play, pause, seek and chapter change drive the bed; nothing here reports back.
// The narration's speed is read only to be ignored: the bed always plays at BED_RATE, never sped up or
// pitch-shifted (A9).
//
// How the bed enters and leaves (07.3, A3, A4): every ramp is a pure function of elapsed ms, multiplied into one
// enter-exit gain (bedEnvelope) that src/lib/mix.ts bedVolume composes with the level, the crossfade and the duck.
// The bed ramps in from silence on play, after a pause and after a seek (BED_ENTER_MS); a sleep timer fades it to
// silence over its last SLEEP_FADE_S (or its whole length; an End of chapter timer over the chapter's last 60 s);
// with quiet opening on it holds silent for the first OPENING_HOLD_S of every chapter, then ramps in, and fades out
// over the last BED_ENTER_MS before a boundary the clock runs across, so the hold starts silent rather than cut; and
// at the book's end (and on a companion-mode pause, src/lib/companion.ts) it fades out over BED_EXIT_MS while the
// engine plays it on, instead of stopping with the narration.
import type { ClockEvent, ClockState } from "./clock.ts";
import type { ChapterScore, Scene, SleepTimer } from "./types.ts";
import { scenePiecesOf, scenesOf } from "./scenes.ts";
import { SOUNDSCAPE_OFF } from "./settings-store.ts";
import { DEFAULT_SOUNDSCAPE_ID } from "./soundscapes.ts";

/** The bed's playback rate, whatever the narration's speed (A9). */
export const BED_RATE = 1;
/** How long a chapter-boundary crossfade takes (ms). */
export const CROSSFADE_MS = 2000;
/** How long the bed takes to ramp in from silence: on play, after a pause or a seek, and after the opening hold (ms). */
export const BED_ENTER_MS = 1500;
/** A sleep timer fades the bed out over its last this many seconds (a shorter timer over its whole length). */
export const SLEEP_FADE_S = 60;
/** Quiet opening: the bed holds silent for the first this many seconds of every chapter. */
export const OPENING_HOLD_S = 20;
/** At the book's end (and a companion-mode pause) the bed fades out over this long instead of stopping (ms). */
export const BED_EXIT_MS = 4000;

/**
 * What the bed carries: a soundscape (v1), the chapter's catalog piece (01.10: the pick, else auto, looped for the
 * chapter, falling back to the choice's soundscape, else silence) or nothing.
 */
export type BedLayer = "soundscape" | "music" | "off";

/** One choice of what the bed plays (spec 01, Contracts: Mix's layer and soundscape id). */
export type BedChoice = {
  layer: BedLayer;
  /**
   * The soundscape when the layer is one; with music (01.10), the soundscape it falls back to where no piece may play
   * (the one on when Music was picked), or null for silence; null with off.
   */
  soundscapeId: string | null;
};

/**
 * A book's bed, saved in its Mix (01.7, A12): the book's choice, and the chapters that have their own, keyed by
 * chapter index. A chapter's own choice wins over the book's.
 */
export type BedSetting = BedChoice & { chapterBeds: Record<string, BedChoice> };

/** A new book: Night Wind under every chapter, no chapter of its own. */
export const DEFAULT_BED: BedSetting = { layer: "soundscape", soundscapeId: DEFAULT_SOUNDSCAPE_ID, chapterBeds: {} };

/**
 * The layer a book with no choice of its own plays (06.3): the listener's default soundscape setting. Null (nothing
 * set) is DEFAULT_BED, "off" is no bed, and a soundscape id plays that loop (one no longer bundled falls back as
 * bedSoundFor says). A book's own choice, once saved in its Mix, always wins over this.
 */
export function defaultBedFor(defaultSoundscapeId: string | null): BedSetting {
  if (defaultSoundscapeId === SOUNDSCAPE_OFF) return { layer: "off", soundscapeId: null, chapterBeds: {} };
  if (defaultSoundscapeId) return { layer: "soundscape", soundscapeId: defaultSoundscapeId, chapterBeds: {} };
  return DEFAULT_BED;
}

/** The Music chip's pick (01.10): the chapter's piece. No soundscape has this id. */
export const MUSIC_PICK = "music";

/** A pick from the mixer's layer chips: "off", "music" (01.10), or a soundscape id. */
export type LayerPick = "off" | typeof MUSIC_PICK | string;

// ---- The chapter's piece as a bed sound (01.10) -------------------------------------------------------------

const PIECE_SOUND = "piece:";

/** The bed's sound id for a catalog piece, apart from every soundscape id. */
export function pieceSound(pieceId: string): string {
  return `${PIECE_SOUND}${pieceId}`;
}

/** The catalog piece a bed sound plays, or null for a soundscape. */
export function pieceOfSound(soundId: string | null): string | null {
  return soundId && soundId.startsWith(PIECE_SOUND) ? soundId.slice(PIECE_SOUND.length) || null : null;
}

/**
 * The music layer's reach into the catalog: the piece that may play for a chapter now (its playing scene's, the
 * pick covering every scene), already cleared by src/lib/piece-source.ts, or null when none may or can.
 */
export type MusicSource = { pieceFor: (chapterIndex: number) => string | null };

const LAYERS: readonly BedLayer[] = ["soundscape", "music", "off"];

/** A BedChoice from anything stored, or null when it is not one. */
export function normalizeBedChoice(raw: unknown): BedChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof BedChoice, unknown>>;
  if (!LAYERS.includes(r.layer as BedLayer)) return null;
  const layer = r.layer as BedLayer;
  if (layer === "off") return { layer, soundscapeId: null };
  if (layer === "music") return { layer, soundscapeId: typeof r.soundscapeId === "string" && r.soundscapeId ? r.soundscapeId : null };
  return { layer, soundscapeId: typeof r.soundscapeId === "string" && r.soundscapeId ? r.soundscapeId : DEFAULT_SOUNDSCAPE_ID };
}

/**
 * A BedSetting from anything stored (a mix saved before 01.7 has none): broken parts take the default, or
 * `fallback` (the default soundscape setting, defaultBedFor) when the book has no layer of its own.
 */
export function normalizeBed(raw: unknown, fallback: BedChoice = DEFAULT_BED): BedSetting {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof BedSetting, unknown>>;
  const book = normalizeBedChoice(r) ?? fallback;
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
 * longer bundled falls back to the default one, then to the catalog's first; off plays nothing. Music (01.10) plays
 * the chapter's piece (`music.pieceFor`, as pieceSound) and, where no piece may or can play (an unscored chapter, a
 * piece not in the catalog or not licensed to play, audio not reachable), its fallback soundscape: the choice's own,
 * else the book's when the book plays one, else silence. Never anything unlicensed (A18).
 */
export function bedSoundFor(
  chapterIndex: number | null,
  setting: BedSetting | BedChoice,
  catalog: readonly string[],
  music?: MusicSource,
): string | null {
  if (chapterIndex === null) return null;
  const choice = choiceFor(chapterIndex, setting);
  if (choice.layer === "off") return null;
  if (choice.layer === "music") {
    const piece = music?.pieceFor(chapterIndex) ?? null;
    if (piece) return pieceSound(piece);
    const book = "chapterBeds" in setting && setting.layer === "soundscape" ? setting.soundscapeId : null;
    const fallback = choice.soundscapeId ?? book;
    return fallback ? soundscapeIn(fallback, catalog) : null;
  }
  return soundscapeIn(choice.soundscapeId, catalog);
}

/** A soundscape id as bundled: itself, else the default loop, else the catalog's first; null with none bundled. */
function soundscapeIn(id: string | null, catalog: readonly string[]): string | null {
  if (catalog.length === 0) return null;
  if (id && catalog.includes(id)) return id;
  return catalog.includes(DEFAULT_SOUNDSCAPE_ID) ? DEFAULT_SOUNDSCAPE_ID : catalog[0];
}

/** True when the book or any chapter of its own plays music (01.10): the player then reads the catalog. */
export function usesMusic(setting: BedSetting): boolean {
  return setting.layer === "music" || Object.values(setting.chapterBeds ?? {}).some((c) => c.layer === "music");
}

/** The chip that is on for a chapter: "off", "music" (01.10), a soundscape id, or null with nothing bundled. */
export function pickFor(chapterIndex: number | null, setting: BedSetting, catalog: readonly string[]): LayerPick | null {
  const choice = choiceFor(chapterIndex, setting);
  if (choice.layer === "off") return "off";
  if (choice.layer === "music") return MUSIC_PICK;
  return bedSoundFor(chapterIndex ?? 0, setting, catalog);
}

/**
 * A chip's choice. Music keeps the soundscape that was on (or the one music already falls back to) as its fallback,
 * so a chapter no piece may play for keeps sounding as it did; from off, music falls back to silence.
 */
function choiceOf(pick: LayerPick, current: BedChoice): BedChoice {
  if (pick === "off") return { layer: "off", soundscapeId: null };
  if (pick === MUSIC_PICK) return { layer: "music", soundscapeId: current.layer === "off" ? null : current.soundscapeId };
  return { layer: "soundscape", soundscapeId: pick };
}

/**
 * A pick from the layer chips: it sets the chapter's own choice when that chapter has one ("This chapter only" on),
 * otherwise the book's, which every chapter without its own follows.
 */
export function pickLayer(setting: BedSetting, chapterIndex: number | null, pick: LayerPick): BedSetting {
  const choice = choiceOf(pick, chapterBed(setting, chapterIndex) ?? setting);
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

/** Chapters' own beds re-keyed by `move` (an old index to its new ones; none drops it), for a merge or split. */
function rekey(beds: Record<string, BedChoice>, move: (index: number) => number[]): Record<string, BedChoice> {
  const out: Record<string, BedChoice> = {};
  for (const [key, choice] of Object.entries(beds)) {
    for (const to of move(Number(key))) out[String(to)] = choice;
  }
  return out;
}

/**
 * The chapters' own beds after chapter `index` merges with the next (A32, src/lib/chapters.ts mergeWithNext): the
 * merged chapter keeps the first's own bed (or follows the book, as the first did), the second's is dropped, and
 * every later chapter's moves down one with it.
 */
export function bedsAfterMerge(beds: Record<string, BedChoice>, index: number): Record<string, BedChoice> {
  return rekey(beds, (i) => (i <= index ? [i] : i === index + 1 ? [] : [i - 1]));
}

/**
 * The chapters' own beds after chapter `index` splits in two (A32, src/lib/chapters.ts splitChapter): both halves
 * keep its own bed, and every later chapter's moves up one with it.
 */
export function bedsAfterSplit(beds: Record<string, BedChoice>, index: number): Record<string, BedChoice> {
  return rekey(beds, (i) => (i < index ? [i] : i === index ? [i, i + 1] : [i + 1]));
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

// ---- The bed enters and leaves (07.3, A3, A4) ---------------------------------------------------------------

/** An equal-power ramp up: 0 at `elapsedMs` 0, 1 once `durationMs` has passed (the crossfade's incoming curve). */
export function rampIn(elapsedMs: number, durationMs: number): number {
  return crossfadeGains(Number.isFinite(elapsedMs) ? elapsedMs : 0, durationMs).in;
}

/** An equal-power ramp down: 1 at `elapsedMs` 0, 0 once `durationMs` has passed. */
export function rampOut(elapsedMs: number, durationMs: number): number {
  return crossfadeGains(Number.isFinite(elapsedMs) ? elapsedMs : 0, durationMs).out;
}

/** The enter ramp, `sinceEnterMs` after a play, a resume or a seek; null (no entry under way) is full. */
export function enterGain(sinceEnterMs: number | null): number {
  return sinceEnterMs === null ? 1 : rampIn(sinceEnterMs, BED_ENTER_MS);
}

/**
 * Quiet opening (A4): silent for the first OPENING_HOLD_S of the chapter, then the enter ramp. Off, always full.
 * Read from the place in the chapter, so a seek past the hold skips it and a seek back to the start brings it back.
 */
export function openingGain(intoChapterMs: number, quietOpening: boolean): number {
  if (!quietOpening) return 1;
  return rampIn(intoChapterMs - OPENING_HOLD_S * 1000, BED_ENTER_MS);
}

/**
 * Before a boundary the clock runs across into a held opening, the bed fades out over the chapter's last
 * BED_ENTER_MS, so the next chapter's hold begins silent instead of cutting the bed off. Full when quiet opening
 * is off or the clock does not run on by itself (the book's last chapter, where BED_EXIT_MS takes over; a
 * companion clock with its chapter timer off, which holds at the chapter's end with the bed looping).
 */
export function closingGain(chapterLeftMs: number, quietOpening: boolean, runsOn: boolean): number {
  if (!quietOpening || !runsOn) return 1;
  return rampIn(chapterLeftMs, BED_ENTER_MS);
}

/** A sleep timer's fade: ms left until it fires, and the fade's length. */
export type SleepFade = { leftMs: number; fadeMs: number };

type ChapterSpan = { index: number; start: number; end: number };

/**
 * The fade a sleep timer puts on the bed (A3): a minutes timer over its last SLEEP_FADE_S of wall clock, or its
 * whole length when shorter; an End of chapter timer over the chapter's last SLEEP_FADE_S of book time, or the
 * whole chapter when shorter. Null with no timer.
 */
export function sleepFade(
  timer: SleepTimer | null,
  now: number,
  position: number,
  chapters: readonly ChapterSpan[],
): SleepFade | null {
  if (!timer) return null;
  if (timer.kind === "minutes") {
    return { leftMs: timer.endsAt - now, fadeMs: Math.min(SLEEP_FADE_S, Math.max(0, timer.minutes) * 60) * 1000 };
  }
  const chapter = chapters.find((c) => c.index === timer.chapterIndex);
  const length = chapter ? chapter.end - chapter.start : SLEEP_FADE_S;
  return { leftMs: (timer.end - position) * 1000, fadeMs: Math.min(SLEEP_FADE_S, Math.max(0, length)) * 1000 };
}

/** The sleep timer's gain: full until its fade begins, then down to silence as it fires. No timer, full. */
export function sleepGain(fade: SleepFade | null): number {
  if (!fade) return 1;
  if (!(fade.leftMs > 0)) return 0;
  return rampOut(fade.fadeMs - fade.leftMs, fade.fadeMs);
}

/** The exit ramp at the book's end (and a companion-mode pause), `sinceExitMs` after the clock stopped. */
export function exitGain(sinceExitMs: number, durationMs: number = BED_EXIT_MS): number {
  return rampOut(sinceExitMs, durationMs);
}

/** What the enter-exit gain is read from, sampled by the engine while the bed plays. */
export type EnvelopeInput = {
  /** Ms since the bed last entered (play, resume, seek), or null. */
  sinceEnterMs: number | null;
  /** Ms of book time into the playing chapter, and left in it. */
  intoChapterMs: number;
  chapterLeftMs: number;
  /** The book's quiet opening (Mix.quietOpening). */
  quietOpening: boolean;
  /** The clock runs on into the next chapter by itself (see closingGain). */
  runsOn: boolean;
  sleep: SleepFade | null;
};

/** The bed's enter-exit gain: the enter ramp, the quiet opening and its closing fade, and the sleep fade, multiplied. */
export function bedEnvelope(i: EnvelopeInput): number {
  return round(
    enterGain(i.sinceEnterMs) *
      openingGain(i.intoChapterMs, i.quietOpening) *
      closingGain(i.chapterLeftMs, i.quietOpening, i.runsOn) *
      sleepGain(i.sleep),
  );
}

/**
 * True when the bed enters afresh, its ramp starting from silence: the clock starts playing (a cold start, a
 * resume after a pause), or it seeks or loads while playing. A tick, a chapter crossed by playing on, a speed
 * change or a layer pick never restarts it.
 */
export function entersNow(wasPlaying: boolean, clock: ClockState, event: ClockEvent): boolean {
  if (!clock.playing || !clock.bookId) return false;
  return !wasPlaying || event === "seek" || event === "load";
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
  /** `fadeMs` (07.3): fade the bed out over this long, playing on, before it stops; absent, stop at once. */
  | { type: "pause"; fadeMs?: number }
  /**
   * The clock is in another scene of the chapter (07.2, planScene). The engine logs it; what is heard follows from
   * planBed, whose sound on the music layer is the playing scene's piece (01.10), so a scene boundary is a change.
   */
  | SceneCommand;

export type BedContext = {
  /** The start (book seconds) of the chapter the clock is in. */
  chapterStart: number;
  /** The sound for a chapter (see bedSoundFor). */
  soundFor: (chapterIndex: number | null) => string | null;
  /** A sound's loop length in seconds. */
  loopSeconds: (soundId: string) => number;
  /**
   * Where a sound's loop is anchored in the book (seconds): the chapter's start when absent. A scene's piece (01.10)
   * anchors at its scene's start, so it starts from its top there and every listen lands on the same place in it.
   */
  anchorFor?: (soundId: string) => number;
  /** How long the bed fades out when the clock stops here (src/lib/companion.ts bedExitMs); 0 or absent, at once. */
  exitMs?: number;
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
  const anchor = soundId ? (ctx.anchorFor?.(soundId) ?? ctx.chapterStart) : ctx.chapterStart;
  const offset = soundId ? bedOffset(clock.position, anchor, ctx.loopSeconds(soundId)) : 0;
  const state: BedState = { soundId, playing };

  if (soundId !== prev.soundId) {
    // Heard before and after: crossfade. Silent on either side: switch, fading out what was playing.
    const fade = prev.playing && (playing || soundId === null);
    return { state, commands: [{ type: "change", to: soundId, offset, play: playing, fade }] };
  }

  const commands: BedCommand[] = [];
  if (soundId !== null && (event === "seek" || event === "load")) commands.push({ type: "seek", offset });
  if (playing !== prev.playing) {
    const fadeMs = ctx.exitMs ?? 0;
    commands.push(playing ? { type: "play" } : fadeMs > 0 ? { type: "pause", fadeMs } : { type: "pause" });
  }
  return { state, commands };
}

// ---- Scenes inside a chapter (07.2, spec 07 A2) -------------------------------------------------------------
//
// A scored chapter may hold 1 to 4 scenes, each covering a `span` of it in order (src/lib/scenes.ts reads them). The
// engine maps the clock's place in the chapter to a scene (sceneAt) and, when that place crosses a scene boundary
// inside the chapter, crosses to the next scene's piece over the same CROSSFADE_MS as a chapter change; a seek back
// crosses the other way (planScene). A scene's piece is the chapter-wide pick when there is one (scenePiecesOf,
// D18), so a pick plays for every scene and its boundaries cross nothing. The scene command itself is logged; what is
// heard comes from planBed: on the music layer (01.10) its sound is the playing scene's piece (MusicSource), so the
// boundary is a change, crossfaded while playing, and a soundscape plays on through it unchanged.

type SceneSpan = Pick<Scene, "span">;

/**
 * Where each scene starts, in seconds into a chapter of `chapterLength`: the spans read as shares of the chapter (so
 * spans that do not sum to 1 still cover it), a broken span (not a positive number) counting for nothing, and with no
 * usable span at all the scenes share the chapter evenly.
 */
export function sceneStarts(chapterLength: number, scenes: readonly SceneSpan[]): number[] {
  const length = Number.isFinite(chapterLength) && chapterLength > 0 ? chapterLength : 0;
  const weights = scenes.map((s) => (Number.isFinite(s.span) && s.span > 0 ? s.span : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const shares = total > 0 ? weights.map((w) => w / total) : weights.map(() => 1 / scenes.length);
  const starts: number[] = [];
  let at = 0;
  for (const share of shares) {
    starts.push(round(at * length));
    at += share;
  }
  return starts;
}

/**
 * The scene (its index) the clock is in, `positionInChapter` seconds into a chapter of `chapterLength`: a boundary
 * belongs to the scene it starts (a scene with no length never plays), before the start reads as the first scene
 * and past the end as the last. A chapter with no length is its first scene. Null when the chapter has no scenes.
 */
export function sceneAt(positionInChapter: number, chapterLength: number, scenes: readonly SceneSpan[]): number | null {
  if (scenes.length === 0) return null;
  if (!(Number.isFinite(chapterLength) && chapterLength > 0)) return 0;
  const into = Number.isFinite(positionInChapter) ? positionInChapter : 0;
  const starts = sceneStarts(chapterLength, scenes);
  let scene = 0;
  for (let i = 1; i < starts.length; i++) if (into >= starts[i] - SCENE_SLACK_S) scene = i;
  return scene;
}

/** A little slack at a scene boundary, so float noise in the clock's place never holds a scene back. */
const SCENE_SLACK_S = 0.001;

/** What the scene plan reads for the playing chapter: where it sits in the book, its length, scenes and their pieces. */
export type SceneContext = {
  chapterStart: number;
  chapterLength: number;
  scenes: readonly Scene[];
  /** One piece id per scene (null where no piece is named), the pick for every scene when there is one. */
  pieces: readonly (string | null)[];
};

/**
 * The scene context for a chapter's stored score: its scenes (one, the whole chapter, when it has none) and each
 * scene's piece (scenePiecesOf: the pick covers the chapter). Null for a chapter with no score, or one scored too
 * little to have a mood.
 */
export function sceneContextFor(score: ChapterScore | null, chapter: { start: number; end: number }): SceneContext | null {
  if (!score) return null;
  const scenes = scenesOf(score.mood);
  if (scenes.length === 0) return null;
  const named = scenePiecesOf(score.playlist, scenes.length);
  return {
    chapterStart: chapter.start,
    chapterLength: Math.max(0, chapter.end - chapter.start),
    scenes,
    pieces: scenes.map((_, i) => named[i] ?? null),
  };
}

/**
 * Where a scene's piece is anchored in the book (01.10): the start of the run of scenes, back from this one, that
 * share its piece. A piece that covers the whole chapter (a pick, D18, or one piece for every scene) anchors at the
 * chapter's start, so a seek lands where playing on would have; a scene with a piece of its own starts it from its
 * top at its own start.
 */
export function pieceAnchor(ctx: SceneContext, scene: number): number {
  if (scene <= 0 || scene >= ctx.scenes.length) return ctx.chapterStart;
  const starts = sceneStarts(ctx.chapterLength, ctx.scenes);
  let first = scene;
  while (first > 0 && ctx.pieces[first - 1] === ctx.pieces[scene]) first--;
  return ctx.chapterStart + starts[first];
}

/** The scene the bed is in: its book and chapter, the scene's index and its piece; all null outside a scored chapter. */
export type SceneSpot = { bookId: string | null; chapterIndex: number | null; scene: number | null; pieceId: string | null };

export const NO_SCENE: SceneSpot = { bookId: null, chapterIndex: null, scene: null, pieceId: null };

/**
 * One scene instruction for the engine: the bed is now in `scene` of the chapter, whose piece is `pieceId`.
 * `direction` is "on" across a boundary forward, "back" across one backward (a seek back), "enter" on coming into
 * the chapter (its own change crosses then, so no scene crossfade); a pick inside a scene reads as "on". `crossfade`: cross to the scene's piece over
 * `fadeMs` (CROSSFADE_MS), true only while playing, inside the chapter, and to another piece than the one heard.
 */
export type SceneCommand = {
  type: "scene";
  chapterIndex: number;
  scene: number;
  from: number | null;
  pieceId: string | null;
  direction: "on" | "back" | "enter";
  crossfade: boolean;
  fadeMs: number;
};

/**
 * The scene the clock is in and, when it moved (a boundary crossed, a seek, a chapter entered, a pick that changes
 * the scene's piece), what to tell the engine. Pure, from the clock and the playing chapter's scene context.
 */
export function planScene(
  prev: SceneSpot,
  clock: ClockState,
  ctx: SceneContext | null,
): { spot: SceneSpot; command: SceneCommand | null } {
  if (!clock.bookId || clock.chapterIndex === null || !ctx) return { spot: NO_SCENE, command: null };
  const scene = sceneAt(clock.position - ctx.chapterStart, ctx.chapterLength, ctx.scenes);
  if (scene === null) return { spot: NO_SCENE, command: null };
  const pieceId = ctx.pieces[scene] ?? null;
  const spot: SceneSpot = { bookId: clock.bookId, chapterIndex: clock.chapterIndex, scene, pieceId };
  const within = prev.bookId === clock.bookId && prev.chapterIndex === clock.chapterIndex && prev.scene !== null;
  if (within && prev.scene === scene && prev.pieceId === pieceId) return { spot, command: null };
  const direction = !within ? "enter" : scene > prev.scene! ? "on" : scene < prev.scene! ? "back" : "on";
  return {
    spot,
    command: {
      type: "scene",
      chapterIndex: clock.chapterIndex,
      scene,
      from: within ? prev.scene : null,
      pieceId,
      direction,
      crossfade: within && clock.playing && pieceId !== prev.pieceId,
      fadeMs: CROSSFADE_MS,
    },
  };
}

/**
 * The line the engine logs for a scene command: which chapter and scene (counted from 0), its piece, the way it
 * crossed and whether it crossfades (on the music layer, 01.10; a soundscape plays on through it unchanged).
 */
export function sceneLogLine(c: SceneCommand): string {
  return `bed scene: chapter=${c.chapterIndex} scene=${c.scene} piece=${c.pieceId ?? "none"} direction=${c.direction} crossfade=${c.crossfade}`;
}
