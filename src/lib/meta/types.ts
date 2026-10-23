// What the tag parsers read from one audio file (spec 01, 01.6): tags, a cover, chapter markers, and whether
// the file is locked by DRM. Every field but `format`, `chapters` and `drm` is optional: a file may carry none.

export type AudioFormat = "mp3" | "mp4" | "flac" | "ogg" | "wav" | "unknown";

/** Audible's two download formats, or another DRM scheme (FairPlay) seen in an MP4. */
export type DrmKind = "aax" | "aaxc" | "protected";

export type Picture = { mime: string; data: Uint8Array };

/** A chapter marker inside one file; seconds from the file's start. */
export type TagChapter = { title: string; start: number; end?: number };

export type AudioMeta = {
  format: AudioFormat;
  title?: string;
  album?: string;
  artist?: string;
  albumArtist?: string;
  composer?: string;
  narrator?: string;
  track?: number;
  disc?: number;
  cover?: Picture;
  chapters: TagChapter[];
  /** Seconds, when the container states it. */
  duration?: number;
  drm: DrmKind | null;
};

export function emptyMeta(format: AudioFormat): AudioMeta {
  return { format, chapters: [], drm: null };
}

/** "3/12" or "3" as 3; anything else is undefined. */
export function leadingNumber(s: string | undefined): number | undefined {
  const m = s?.match(/^\s*(\d+)/);
  return m ? Number(m[1]) : undefined;
}

/** Sorts markers by start and drops duplicates and empty titles' gaps. */
export function tidyChapters(list: TagChapter[]): TagChapter[] {
  const sorted = list
    .filter((c) => Number.isFinite(c.start) && c.start >= 0)
    .sort((a, b) => a.start - b.start);
  const out: TagChapter[] = [];
  for (const c of sorted) {
    if (out.length && Math.abs(out[out.length - 1].start - c.start) < 0.001) continue;
    out.push(c);
  }
  return out;
}
