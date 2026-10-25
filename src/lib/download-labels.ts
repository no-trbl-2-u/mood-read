// Pure text for the Downloads screen's queue rows (A6), so the wording is tested where it is made, as
// src/lib/labels.ts and readouts.ts do for the library and the mini player.
import { formatBytes } from "./storage.ts";
import type { PlaylistStatus } from "./playlist.ts";
import type { Download, DownloadTarget } from "./types.ts";

/** What a download holds, in words: "Book" or "Piece" (pieces are nameless until the catalog exists, 05.1). */
export function downloadKindLabel(target: DownloadTarget): string {
  return target.kind === "book" ? "Book" : "Piece";
}

/**
 * A queue row's caption, as design/layouts/DECISION.md's Downloads frame reads it: "Book · 62% · 412 KB of 664
 * KB", "Book · queued", "Piece · failed: the connection dropped".
 */
export function downloadCaption(d: Pick<Download, "target" | "state" | "bytes" | "totalBytes" | "error">): string {
  const kind = downloadKindLabel(d.target);
  switch (d.state) {
    case "queued":
      return `${kind} · queued`;
    case "done":
      return `${kind} · downloaded`;
    case "paused":
      return d.totalBytes ? `${kind} · paused · ${formatBytes(d.bytes)} of ${formatBytes(d.totalBytes)}` : `${kind} · paused`;
    case "failed":
      return d.error ? `${kind} · failed: ${d.error}` : `${kind} · failed`;
    case "running":
      if (!d.totalBytes) return `${kind} · downloading`;
      return `${kind} · ${Math.min(100, Math.round((d.bytes / d.totalBytes) * 100))}% · ${formatBytes(d.bytes)} of ${formatBytes(d.totalBytes)}`;
  }
}

/**
 * The playlist band's line (05.4, A4): "Downloading music: 1 of 3 pieces · 1.2 MB of 4.5 MB", "Music paused: 1 of 3
 * pieces", "2 pieces didn't download", "Playlist on this device: 3 pieces · 4.5 MB". Null before it is built (the
 * band shows its button).
 */
export function playlistLine(s: Pick<PlaylistStatus, "state" | "done" | "total" | "bytes" | "totalBytes" | "failed">): string | null {
  const pieces = (n: number) => `${n} ${n === 1 ? "piece" : "pieces"}`;
  const of = `${s.done} of ${pieces(s.total)}`;
  switch (s.state) {
    case "unbuilt":
      return null;
    case "building":
      return `Downloading music: ${of} · ${formatBytes(s.bytes)} of ${formatBytes(s.totalBytes)}`;
    case "paused":
      return `Music paused: ${of}`;
    case "failed":
      return `${pieces(s.failed)} didn't download: ${of} on this device`;
    case "done":
      return `Playlist on this device: ${pieces(s.total)} · ${formatBytes(s.totalBytes)}`;
  }
}
