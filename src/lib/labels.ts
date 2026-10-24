// Pure text for the library rows, bookmarks and the speed control, so the wording is tested where it is made.
import { formatDuration } from "./format-duration.ts";
import { intensityPercent } from "./mood-card.ts";
import { chapterAt, END_SLACK, stripExtension } from "./timeline.ts";
import type { Book } from "./types.ts";

/**
 * A library row's muted line: chapter count and state, as the layout board draws it
 * ("12 ch · resuming Ch.7", "9 ch · not started", "21 ch · 3% done").
 * `resuming` marks the book the listener played last.
 */
export function bookStateLine(book: Pick<Book, "chapters" | "duration">, position: number, resuming: boolean): string {
  const count = `${book.chapters.length} ch`;
  if (!(position > 0)) return `${count} · not started`;
  if (position >= book.duration - END_SLACK) return `${count} · finished`;
  if (resuming) {
    const chapter = chapterAt(book.chapters, position);
    return `${count} · resuming Ch.${(chapter?.index ?? 0) + 1}`;
  }
  const pct = book.duration > 0 ? Math.max(1, Math.floor((position / book.duration) * 100)) : 0;
  return `${count} · ${pct}% done`;
}

/** Where a position falls, as a bookmark row reads it: "Ch. 2 — 0:12" (time within the chapter). */
export function chapterTimeLabel(chapters: Book["chapters"], position: number): string {
  const chapter = chapterAt(chapters, position);
  const within = position - (chapter?.start ?? 0);
  return `Ch. ${(chapter?.index ?? 0) + 1} — ${formatDuration(within)}`;
}

/** A speed as its chip reads: "1.0x", "1.5x", "3.0x". */
export function speedLabel(speed: number): string {
  return `${speed.toFixed(1)}x`;
}

/** A book's title from its file names: their common prefix ("Dune - 01.mp3", "Dune - 02.mp3" give "Dune"), else the first name. */
export function guessTitle(names: string[]): string {
  const bases = names.map(stripExtension);
  if (bases.length === 0) return "Untitled";
  if (bases.length === 1) return bases[0].trim() || "Untitled";
  let prefix = bases[0];
  for (const b of bases) while (!b.startsWith(prefix)) prefix = prefix.slice(0, -1);
  const cleaned = prefix.replace(/[\s\-_.([]*(part|chapter|ch|disc|cd)?[\s\-_.]*\d*$/i, "").trim();
  return cleaned.length >= 2 ? cleaned : bases[0].trim() || "Untitled";
}

/**
 * An emotion sticker's words, read aloud as shown: the emotion and, once scored, its intensity ("Wonder 80%").
 * Colour never carries either alone (spec 06, A5).
 */
export function stickerLabel(emotion: string, intensity?: number): string {
  if (intensity === undefined || !Number.isFinite(intensity)) return emotion;
  return `${emotion} ${intensityPercent(intensity)}%`;
}

/** A clock time as the scoring band says it, in the device's own time zone: "3:40 pm", "12:05 am" (01.25). */
export function clockTimeLabel(at: number): string {
  const d = new Date(at);
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A day as the scoring band says it: "31 Oct" (01.25). */
export function dayLabel(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** True when two times fall on the same calendar day on this device. */
export function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
