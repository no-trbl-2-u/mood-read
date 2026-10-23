// Pure text for the mini player's time readouts (A28): the playing chapter's elapsed and length, and what is left
// of a running sleep timer. Every time readout of the playing book is made here and shown in the mini player.
import { formatDuration } from "./format-duration.ts";
import type { SleepTimer } from "./types.ts";

/** The playing chapter's elapsed and length, each as a clock ("3:05", "11:45"); elapsed stays inside the chapter. */
export function chapterClock(start: number, end: number, position: number): { elapsed: string; length: string } {
  const length = Math.max(0, end - start);
  const within = Math.min(length, Math.max(0, position - start));
  return { elapsed: formatDuration(within), length: formatDuration(length) };
}

/**
 * What is left of a sleep timer, as the mini player reads it: "Sleep · 14 min" (whole minutes, rounded up, never
 * under 1 while it runs, never over the minutes set, so a clock a tick behind cannot read more) or "Sleep · end of
 * chapter". Null when no timer runs. `now` is the wall clock in ms.
 */
export function sleepReadout(sleep: SleepTimer | null, now: number): string | null {
  if (!sleep) return null;
  if (sleep.kind === "chapterEnd") return "Sleep · end of chapter";
  const minutes = Math.min(sleep.minutes, Math.max(1, Math.ceil((sleep.endsAt - now) / 60_000)));
  return `Sleep · ${minutes} min`;
}
