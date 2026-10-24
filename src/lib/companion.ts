// Companion mode (01.14, spec 01 A27): Mood Read plays only its bed beside another app (Audible, Libby, Chirp, a
// music app), with no narration. Pure decisions only, so `node --test` runs them; src/player/PlayerProvider.tsx
// carries them out.
//
// The audio session (docs/workarounds.md, Companion mode). Off is today's session exactly: exclusive focus
// (`doNotMix`), which expo-audio needs for lock-screen controls, and the lock screen / Media Session claimed for the
// narration (A4). On mixes with the other app: iOS `.playback` with `mixWithOthers` (expo-audio sets that category
// when playsInSilentMode is on), and on Android `mixWithOthers` requests no audio focus at all, so no
// AUDIOFOCUS_GAIN and nothing of the other app's is paused or faded. Never `duckOthers`, never a lock-screen or
// Media Session claim, and the narration never loads: Mood Read neither captures, controls, reads nor ducks the
// other app. Chapters are never followed automatically (iOS has no API; Android's notification access is unclear).
//
// The chapter clock. With no narration, the bed follows a silent clock over the book's own chapters: it starts
// where the narration last stopped, runs at the book's speed while playing, and moves by the listener's tap (a
// chapter in the river, the 30 s skips, the scrubber). With the chapter timer off it holds just short of the
// chapter's end, the bed looping, until the listener taps on; with it on it runs into the next chapter when this
// one's length is up, so the bed crossfades there by itself, and stops at the book's end.
//
// The bed enters and leaves (07.3): companion mode takes the same ramps as the narration. Its play, and a tap that
// moves the clock, ramp the bed in from silence over BED_ENTER_MS (src/lib/bed.ts entersNow, enterGain); its pause,
// like the book's end in either mode, fades the bed out over BED_EXIT_MS before it stops (bedExitMs). Quiet opening
// and the sleep fade read the companion clock's place as they read the narration's.
import { BED_EXIT_MS } from "./bed.ts";
import { chapterAt, clamp, END_SLACK } from "./timeline.ts";

/** expo-audio's InterruptionMode (node_modules/expo-audio/build/Audio.types.d.ts). */
export type InterruptionMode = "mixWithOthers" | "doNotMix" | "doNotMixPersistent" | "duckOthers";

/** The part of expo-audio's AudioMode Mood Read sets. */
export type SessionAudioMode = {
  playsInSilentMode: boolean;
  shouldPlayInBackground: boolean;
  interruptionMode: InterruptionMode;
};

export type SessionPlan = {
  audioMode: SessionAudioMode;
  /** The narration may load and play. */
  narration: boolean;
  /** The lock screen and the browser's Media Session are claimed (setActiveForLockScreen, its handlers). */
  lockScreen: boolean;
};

/** The narration's session, as it has always been: exclusive, with the lock screen (A4). */
export const NARRATION_SESSION: SessionPlan = {
  audioMode: { playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" },
  narration: true,
  lockScreen: true,
};

/** Companion mode's session: the bed only, mixed with the other app, claiming nothing. */
export const COMPANION_SESSION: SessionPlan = {
  audioMode: { playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "mixWithOthers" },
  narration: false,
  lockScreen: false,
};

/** The audio session for the listener's Companion mode setting. */
export function sessionFor(companionMode: boolean): SessionPlan {
  return companionMode ? COMPANION_SESSION : NARRATION_SESSION;
}

/** The silent clock the bed follows in companion mode: where it was anchored, when, and how it runs. */
export type CompanionClock = {
  /** Book seconds at `anchorAt`. */
  anchor: number;
  /** Wall-clock ms the anchor was taken. */
  anchorAt: number;
  playing: boolean;
  /** The book's speed: matching the other app's keeps the timer in step. */
  rate: number;
};

export type CompanionBook = { duration: number; chapters: { index: number; start: number; end: number }[] };

/**
 * How far short of a chapter's end the clock holds with the timer off: inside the chapter, and within the sleep
 * timer's End of chapter slack (src/lib/timeline.ts), so that timer still fires.
 */
export const COMPANION_HOLD = 0.02;

/** A clock parked at `position`, paused. */
export function startCompanion(position: number, rate: number, now: number): CompanionClock {
  return { anchor: Math.max(0, position), anchorAt: now, playing: false, rate };
}

/** Where the clock is now. */
export function companionPosition(c: CompanionClock, now: number, book: CompanionBook, timer: boolean): number {
  if (!c.playing) return c.anchor;
  const run = c.anchor + (Math.max(0, now - c.anchorAt) / 1000) * c.rate;
  if (timer) return Math.min(run, book.duration);
  const chapter = chapterAt(book.chapters, c.anchor);
  const end = chapter ? Math.min(chapter.end, book.duration) : book.duration;
  return Math.max(c.anchor, Math.min(run, end - COMPANION_HOLD));
}

/** The clock re-anchored where it is now (before a change of timer, speed or play state). */
export function rebase(c: CompanionClock, now: number, book: CompanionBook, timer: boolean): CompanionClock {
  return { ...c, anchor: companionPosition(c, now, book, timer), anchorAt: now };
}

/** Play: from where it is, or from the start once the book has run out. */
export function companionPlay(c: CompanionClock, now: number, book: CompanionBook, timer: boolean): CompanionClock {
  const here = rebase(c, now, book, timer);
  const anchor = here.anchor >= book.duration - END_SLACK ? 0 : here.anchor;
  return { ...here, anchor, playing: true };
}

export function companionPause(c: CompanionClock, now: number, book: CompanionBook, timer: boolean): CompanionClock {
  return { ...rebase(c, now, book, timer), playing: false };
}

/** A tap: a chapter picked in the river, a skip or a scrub moves the clock there, playing or not. */
export function companionMove(c: CompanionClock, now: number, to: number, play: boolean, book: CompanionBook): CompanionClock {
  return { ...c, anchor: clamp(Number.isFinite(to) ? to : 0, 0, book.duration), anchorAt: now, playing: play };
}

/** A new speed from here on. */
export function companionRate(c: CompanionClock, now: number, rate: number, book: CompanionBook, timer: boolean): CompanionClock {
  return { ...rebase(c, now, book, timer), rate };
}

/** True when the timer has run the book out: the clock should stop. */
export function companionFinished(c: CompanionClock, now: number, book: CompanionBook, timer: boolean): boolean {
  return c.playing && timer && companionPosition(c, now, book, timer) >= book.duration;
}

/**
 * How long the bed fades out when its clock stops (07.3): over BED_EXIT_MS at the book's end, and on every
 * companion-mode pause, where the bed is all that plays; a narration pause stops it with the narration, at once.
 */
export function bedExitMs(companion: boolean, atBookEnd: boolean): number {
  return companion || atBookEnd ? BED_EXIT_MS : 0;
}

/**
 * Whether the clock runs on into the next chapter by itself (src/lib/bed.ts closingGain): the narration does, and a
 * companion clock with its chapter timer on; one with the timer off holds at the chapter's end. The last chapter
 * runs into nothing.
 */
export function runsOn(companion: boolean, timer: boolean, lastChapter: boolean): boolean {
  if (lastChapter) return false;
  return !companion || timer;
}
