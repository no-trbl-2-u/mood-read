// Pure helpers for mapping between a book's single timeline and its files and chapters.
// No imports, so `node --test` can run the tests without a bundler.

type FileLike = { duration: number };
type ChapterLike = { index: number; start: number; end: number; fileIndex: number };

export const SKIP_SECONDS = 30;
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 3;

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

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
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

/** The chapter that holds a book position (the last chapter for the very end). */
export function chapterAt<C extends ChapterLike>(chapters: C[], position: number): C | undefined {
  if (chapters.length === 0) return undefined;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (position >= chapters[i].start) return chapters[i];
  }
  return chapters[0];
}

/** One chapter per file: the 01.1 rule until 01.6 reads markers and detects silences. */
export function chaptersFromFiles(files: (FileLike & { name: string })[]) {
  const offsets = fileOffsets(files);
  return files.map((f, i) => ({
    index: i,
    title: files.length === 1 ? 'Chapter 1' : stripExtension(f.name) || `Chapter ${i + 1}`,
    fileIndex: i,
    start: offsets[i],
    end: offsets[i] + f.duration,
  }));
}

export function stripExtension(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{1,5}$/, '');
}

/** "1:02:03" or "2:03". Negative values get a leading minus (for "time left"). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const sign = seconds < 0 ? '-' : '';
  const s = Math.floor(Math.abs(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${sign}${h}:${String(m).padStart(2, '0')}:${sec}` : `${sign}${m}:${sec}`;
}

/** Sleep timer check. Returns true when playback should stop now. */
export function sleepDue(
  timer: { kind: 'minutes'; endsAt: number } | { kind: 'chapterEnd'; chapterIndex: number } | null,
  now: number,
  currentChapterIndex: number | undefined,
): boolean {
  if (!timer) return false;
  if (timer.kind === 'minutes') return now >= timer.endsAt;
  return currentChapterIndex !== undefined && currentChapterIndex > timer.chapterIndex;
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
