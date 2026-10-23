// Pure helpers for a book's single timeline: files, chapters, skips, resume, speed and the sleep timer.
// No imports, so `node --test` runs the tests without a bundler.

type FileLike = { duration: number };
type ChapterLike = { index: number; start: number; end: number };

export const SKIP_SECONDS = 30;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 3;
/** The preset chips of the Speed & Sleep sheet (design/layouts/DECISION.md). */
export const SPEED_PRESETS = [0.5, 1, 1.5, 2, 3] as const;
/** The minute chips of the sleep timer. */
export const SLEEP_MINUTES = [15, 30, 45] as const;
/** How close to the end counts as "finished" (seconds). */
export const END_SLACK = 0.25;
/** A forward skip stops this far short of the book's end (seconds), so the last moment still plays. */
const SKIP_END_MARGIN = 1;
/** How close to a chapter's end the end-of-chapter sleep timer fires (seconds). */
const CHAPTER_END_SLACK = 0.05;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Start offset (seconds in the book) of each file. */
export function fileOffsets(files: FileLike[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const f of files) {
    out.push(at);
    at += f.duration;
  }
  return out;
}

export function totalDuration(files: FileLike[]): number {
  return files.reduce((sum, f) => sum + f.duration, 0);
}

/** Where a book position falls: which file, and the offset inside it. */
export function locate(files: FileLike[], position: number): { fileIndex: number; offset: number } {
  if (files.length === 0) return { fileIndex: 0, offset: 0 };
  const offsets = fileOffsets(files);
  const pos = clamp(position, 0, totalDuration(files));
  for (let i = files.length - 1; i >= 0; i--) {
    if (pos >= offsets[i]) {
      return { fileIndex: i, offset: Math.min(pos - offsets[i], files[i].duration) };
    }
  }
  return { fileIndex: 0, offset: 0 };
}

/** The book position of an offset inside a file. */
export function bookPosition(files: FileLike[], fileIndex: number, offset: number): number {
  return (fileOffsets(files)[fileIndex] ?? 0) + offset;
}

/** The chapter that holds a book position (the first for anything before it, the last for the very end). */
export function chapterAt<C extends ChapterLike>(chapters: C[], position: number): C | undefined {
  if (chapters.length === 0) return undefined;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (position >= chapters[i].start) return chapters[i];
  }
  return chapters[0];
}

export function stripExtension(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{1,5}$/, "");
}

/** One chapter per file: the 01.1 rule until 01.6 reads markers and detects silences. */
export function chaptersFromFiles(bookId: string, files: (FileLike & { name: string })[]) {
  const offsets = fileOffsets(files);
  return files.map((f, i) => ({
    bookId,
    index: i,
    title: files.length === 1 ? "Chapter 1" : stripExtension(f.name).trim() || `Chapter ${i + 1}`,
    fileIndex: i,
    start: offsets[i],
    end: offsets[i] + f.duration,
  }));
}

/** Where a skip of `delta` seconds lands, kept inside the book and a second short of its end. */
export function skipTarget(position: number, delta: number, duration: number): number {
  const from = Number.isFinite(position) ? position : 0;
  return clamp(from + delta, 0, Math.max(0, duration - SKIP_END_MARGIN));
}

/** Where to start a book on opening it: the saved position, or the start if it was finished or is unreadable. */
export function resumeStart(saved: number, duration: number): number {
  if (!Number.isFinite(saved) || saved <= 0) return 0;
  if (saved >= duration - END_SLACK) return 0;
  return saved;
}

/** Sleep timer check: true when playback should stop now. */
export function sleepDue(
  timer: { kind: "minutes"; endsAt: number } | { kind: "chapterEnd"; end: number } | null,
  now: number,
  position: number,
): boolean {
  if (!timer) return false;
  if (timer.kind === "minutes") return now >= timer.endsAt;
  return position >= timer.end - CHAPTER_END_SLACK;
}

/**
 * After a seek, skip or jump: an End of chapter timer follows the chapter now playing, so it stops at that
 * chapter's end rather than at the end of the chapter where it was set. Other timers are unchanged.
 */
export function sleepAfterMove<T extends { kind: "minutes" } | { kind: "chapterEnd"; chapterIndex: number; end: number }>(
  timer: T | null,
  chapters: ChapterLike[],
  position: number,
): T | null {
  if (!timer || timer.kind !== "chapterEnd") return timer;
  const c = chapterAt(chapters, position);
  if (!c || (c.index === timer.chapterIndex && c.end === timer.end)) return timer;
  return { ...timer, chapterIndex: c.index, end: c.end };
}

/** The speed chips this platform can play. */
export function speedPresets(platformMax: number): number[] {
  return SPEED_PRESETS.filter((s) => s <= platformMax);
}

/** One 0.1 step faster (+1) or slower (-1), inside 0.5x and the platform's maximum. */
export function stepSpeed(speed: number, direction: 1 | -1, platformMax: number): number {
  const next = Math.round(speed * 10 + direction) / 10;
  return clamp(next, MIN_SPEED, platformMax);
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
