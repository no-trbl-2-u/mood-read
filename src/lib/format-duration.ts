/**
 * Formats a duration in seconds as a clock string for the player's
 * transport (e.g. a chapter's elapsed time or remaining time).
 *
 * - Fewer than one hour: `M:SS` (minutes unpadded, seconds padded to 2).
 * - One hour or more: `H:MM:SS`.
 * - Negative or non-finite input clamps to `0:00`.
 *
 * Examples: `formatDuration(5)` -> `"0:05"`, `formatDuration(65)` ->
 * `"1:05"`, `formatDuration(3725)` -> `"1:02:05"`.
 */
export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const wholeSeconds = Math.floor(safeSeconds);

  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;

  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    const paddedMinutes = String(minutes).padStart(2, "0");
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}
