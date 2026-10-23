// A book's chapters (spec 01 A6): where they come from, and the listener's edits. Chapters come from the files'
// embedded markers, else one per file, else silences detected in a single file's audio, else one chapter for
// the whole book. The listener can rename a chapter, merge it with the next, and split one at a position.
// Pure, so `node --test` runs it; the screens reach it through ./library.ts.
import { fileOffsets, locate, stripExtension } from "./timeline.ts";
import type { Chapter } from "./types.ts";

type Marker = { title: string; start: number; end?: number };

export type FileForChapters = {
  name: string;
  /** Seconds. */
  duration: number;
  /** The file's own title tag, if it has one. */
  title?: string;
  /** Chapter markers inside the file, seconds from its start. */
  markers: Marker[];
};

export type ChapterSource = "markers" | "files" | "silences" | "single";

/** Chapters shorter than this (seconds) are folded into their neighbour: a marker can sit a hair from another. */
const MIN_MARKER_GAP = 0.5;
/** A split leaves at least this much on each side (seconds). */
export const MIN_SPLIT_PART = 1;

/** Numbers chapters in order and sets the file each starts in. */
function reindex(bookId: string, files: { duration: number }[], list: Omit<Chapter, "bookId" | "index" | "fileIndex">[]) {
  return list.map((c, index) => ({
    bookId,
    index,
    title: c.title,
    fileIndex: locate(files, c.start).fileIndex,
    start: c.start,
    end: c.end,
  }));
}

/** A file's chapter title: its own title tag when the files' titles tell them apart, else its name. */
function fileTitles(files: FileForChapters[]): string[] {
  const tags = files.map((f) => f.title?.trim() ?? "");
  const distinct = tags.every(Boolean) && new Set(tags).size === tags.length;
  return files.map((f, i) => (distinct ? tags[i] : stripExtension(f.name).trim()) || `Chapter ${i + 1}`);
}

/** The chapters of one file's markers, in book time from `offset`. Untitled markers are numbered. */
function markerChapters(markers: Marker[], offset: number, duration: number, numberFrom: number) {
  const sorted = markers
    .filter((m) => Number.isFinite(m.start) && m.start < duration - MIN_MARKER_GAP)
    .sort((a, b) => a.start - b.start);
  const kept: Marker[] = [];
  for (const m of sorted) {
    if (kept.length && m.start - kept[kept.length - 1].start < MIN_MARKER_GAP) continue;
    kept.push(m);
  }
  return kept.map((m, i) => ({
    title: m.title.trim() || `Chapter ${numberFrom + i}`,
    // The first chapter starts with the file, so no audio falls before every chapter.
    start: offset + (i === 0 ? 0 : m.start),
    end: offset + (i + 1 < kept.length ? kept[i + 1].start : duration),
  }));
}

/**
 * Derives a book's chapters. `silenceBreaks` are the points (seconds, in a single file) where detected silences
 * split it; they are used only when there are no markers and only one file.
 */
export function deriveChapters(
  bookId: string,
  files: FileForChapters[],
  silenceBreaks: number[] = [],
): { chapters: Chapter[]; source: ChapterSource } {
  const offsets = fileOffsets(files);
  const total = offsets.length ? offsets[offsets.length - 1] + files[files.length - 1].duration : 0;

  if (files.some((f) => f.markers.length > 0)) {
    const titles = fileTitles(files);
    const list: Omit<Chapter, "bookId" | "index" | "fileIndex">[] = [];
    files.forEach((f, i) => {
      const own = markerChapters(f.markers, offsets[i], f.duration, list.length + 1);
      if (own.length) list.push(...own);
      else list.push({ title: titles[i], start: offsets[i], end: offsets[i] + f.duration });
    });
    return { chapters: reindex(bookId, files, list), source: "markers" };
  }

  if (files.length > 1) {
    const titles = fileTitles(files);
    return {
      chapters: reindex(
        bookId,
        files,
        files.map((f, i) => ({ title: titles[i], start: offsets[i], end: offsets[i] + f.duration })),
      ),
      source: "files",
    };
  }

  const breaks = [...new Set(silenceBreaks)].filter((b) => b > 0 && b < total).sort((a, b) => a - b);
  if (breaks.length) {
    const points = [0, ...breaks, total];
    return {
      chapters: reindex(
        bookId,
        files,
        points.slice(0, -1).map((start, i) => ({ title: `Chapter ${i + 1}`, start, end: points[i + 1] })),
      ),
      source: "silences",
    };
  }

  return {
    chapters: files.length ? [{ bookId, index: 0, title: "Chapter 1", fileIndex: 0, start: 0, end: total }] : [],
    source: "single",
  };
}

/** Renames chapter `index`; an empty name keeps the old one. */
export function renameChapter(chapters: Chapter[], index: number, title: string): Chapter[] {
  const t = title.trim();
  if (!t) return chapters;
  return chapters.map((c) => (c.index === index ? { ...c, title: t } : c));
}

/** True when chapter `index` has a next chapter to merge into it. */
export function canMergeWithNext(chapters: Chapter[], index: number): boolean {
  return index >= 0 && index + 1 < chapters.length;
}

/** Merges chapter `index` with the next: one chapter with the first's title, spanning both. */
export function mergeWithNext(chapters: Chapter[], files: { duration: number }[], index: number): Chapter[] {
  if (!canMergeWithNext(chapters, index)) return chapters;
  const a = chapters[index];
  const b = chapters[index + 1];
  const list = [...chapters.slice(0, index), { ...a, end: b.end }, ...chapters.slice(index + 2)];
  return reindex(a.bookId, files, list);
}

/** True when `position` is far enough inside a chapter to split it there. */
export function canSplitAt(chapters: Chapter[], position: number): boolean {
  const c = chapters.find((x) => position >= x.start && position < x.end);
  return !!c && position - c.start >= MIN_SPLIT_PART && c.end - position >= MIN_SPLIT_PART;
}

/** Splits the chapter holding `position` there; the second part is "<title>, part 2". */
export function splitChapter(chapters: Chapter[], files: { duration: number }[], position: number): Chapter[] {
  if (!canSplitAt(chapters, position)) return chapters;
  const i = chapters.findIndex((x) => position >= x.start && position < x.end);
  const c = chapters[i];
  const list = [
    ...chapters.slice(0, i),
    { ...c, end: position },
    { ...c, title: `${c.title}, part 2`, start: position },
    ...chapters.slice(i + 1),
  ];
  return reindex(c.bookId, files, list);
}
