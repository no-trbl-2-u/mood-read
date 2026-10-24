// Pure text for Browse and a LibriVox book's page (05.8), so the wording is tested where it is made, as
// src/lib/labels.ts and download-labels.ts do for the library and the download queue.
import { parseLength } from "./librivox-api.ts";
import { formatBytes } from "./storage.ts";

/** A duration in seconds as the design's longhand reads it: "3 h 41 min", "41 min" under an hour; null in, null out. */
export function lengthLabel(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

/**
 * Browse's row caption: the author, then the book's overall runtime if archive.org gave one ("Lewis Carroll · 2
 * h 54 min"). Chapter count has no place here: it would cost one metadata call per row, which Browse never makes
 * (one call per book page only).
 */
export function browseRowCaption(creator: string, runtime: string | null): string {
  const label = lengthLabel(parseLength(runtime));
  return label ? `${creator} · ${label}` : creator;
}

/** A LibriVox book page's length line: "3 h 41 min · 12 chapters · 168 MB" (the size is left out when unknown). */
export function bookLengthLine(seconds: number | null, chapterCount: number, bytes: number | null): string {
  const parts = [lengthLabel(seconds), `${chapterCount} chapter${chapterCount === 1 ? "" : "s"}`];
  if (bytes != null) parts.push(formatBytes(bytes));
  return parts.filter((p): p is string => !!p).join(" · ");
}
