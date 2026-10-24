// The Downloads screen's storage meter (05.6, A6): what Mood Read keeps split into books and music, and the
// bytes-to-words it reads them in. Pure text and arithmetic; src/lib/storage-size.ts (native) and
// storage-size.web.ts size the books' files on disk, which this file never touches.
import type { Download } from "./types.ts";

/** Books' bytes (null when the platform cannot size them, today only the web build) and music's, apart (A6). */
export type StorageMeter = { booksBytes: number | null; musicBytes: number };

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** A byte count as the meter reads it: "0 B", "412 KB", "1.2 GB" (one decimal under 10 of a unit, else none). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const decimals = unit > 0 && value < 10 ? 1 : 0;
  return `${value.toFixed(decimals)} ${UNITS[unit]}`;
}

/**
 * Music's bytes today: every piece download that finished, summed. Always 0 until the catalog exists (05.1-05.4
 * add it) and something enqueues a piece, but it is a real sum of the queue, never a hardcoded placeholder.
 */
export function musicBytesFrom(downloads: Pick<Download, "target" | "state" | "bytes">[]): number {
  return downloads.filter((d) => d.target.kind === "piece" && d.state === "done").reduce((sum, d) => sum + d.bytes, 0);
}
