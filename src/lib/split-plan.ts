// Where a one-file book's chapters cut losslessly into one file per chapter (spec 05 A13, 05.11). Only two
// formats are tractable without a much bigger, riskier rewrite: MP3 (frames are independent; a cut at a
// verified frame sync plays cleanly either side of it) and PCM/float WAV (a sample boundary, re-headered).
// MP4/M4A/M4B would need a rebuilt moov sample table (src/lib/meta/mp4.ts reads stco/stsz/stts/stsc, never
// writes them) — left unsplit on purpose; see src/lib/split-files.ts. Pure, so `node --test` runs every byte
// computation here with no file, no bundler, no device; that module only reads and writes what this one plans.
import { extension } from "./meta/read.ts";

/** The formats this device can cut without re-encoding; anything else does not offer the split (A13's hedge). */
export const SPLITTABLE_EXTENSIONS = ["mp3", "wav"] as const;

/**
 * Whether "Split into chapter files" should offer itself: one file holding more than one chapter, in a format
 * whose extension says it is one of `SPLITTABLE_EXTENSIONS` (the same signal src/lib/meta/read.ts's own sniff
 * falls back on when the bytes alone don't say). The actual split re-checks the bytes before writing anything,
 * so a misnamed file is refused there rather than mangled.
 */
export function canOfferSplit(files: { ref: string }[], chapters: { index: number }[]): boolean {
  return (
    files.length === 1 &&
    chapters.length > 1 &&
    (SPLITTABLE_EXTENSIONS as readonly string[]).includes(extension(files[0].ref))
  );
}

// ---- MP3: frame sync search ----

/** MPEG-1/2/2.5 Layer I/II/III bitrates (kb/s) by their 4-bit header index; index 0 (free format) and 15 (bad)
 *  are left out, so an out-of-range read comes back `undefined` the same as those two reserved values. */
const V1_BITRATES: (number | undefined)[][] = [
  [],
  [undefined, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  [undefined, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  [undefined, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
];
const V2_BITRATES: (number | undefined)[][] = [
  [],
  [undefined, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  [undefined, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  [undefined, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
];
/** Hz by version (1, 2, 2.5) and the header's 2-bit index; index 3 is reserved, left out. */
const SAMPLE_RATES: Record<number, number[]> = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] };

/** One MPEG audio frame's header at `o`, or null when the bytes there are not a valid one (agents.md rule: a
 *  stray 0xFF in the audio must not be mistaken for a cut point, so every field is checked, not just the sync). */
export function parseMp3FrameHeader(b: Uint8Array, o: number): { frameSize: number } | null {
  if (o < 0 || o + 4 > b.length) return null;
  if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;
  const versionBits = (b[o + 1] >> 3) & 0x3;
  const layer = 4 - ((b[o + 1] >> 1) & 0x3); // 11->1, 10->2, 01->3, 00 (reserved) ->4
  if (versionBits === 1 || layer === 4) return null;
  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const bitrate = (version === 1 ? V1_BITRATES : V2_BITRATES)[layer][(b[o + 2] >> 4) & 0xf];
  const sampleRate = SAMPLE_RATES[version][(b[o + 2] >> 2) & 0x3];
  if (bitrate === undefined || sampleRate === undefined) return null;
  const padding = (b[o + 2] >> 1) & 0x1;
  const frameSize =
    layer === 1
      ? (Math.floor((12 * bitrate * 1000) / sampleRate) + padding) * 4
      : Math.floor(((layer === 3 && version !== 1 ? 72 : 144) * bitrate * 1000) / sampleRate) + padding;
  return frameSize >= 4 ? { frameSize } : null;
}

/**
 * The nearest byte offset to `center` in `buf` that is both a valid frame header and, when there is room, is
 * followed by another one right where its own size says the next frame starts — a stray sync byte in the
 * audio almost never chains like that, so this is a safe place to cut. Null if nothing within `maxOffset`
 * chains (an unreadable or truncated window); the caller then widens its read or gives up on the split.
 */
export function findMp3Sync(buf: Uint8Array, center: number, maxOffset = 8192): number | null {
  const chains = (o: number): boolean => {
    const head = parseMp3FrameHeader(buf, o);
    if (!head) return false;
    const next = o + head.frameSize;
    return next >= buf.length || parseMp3FrameHeader(buf, next) !== null;
  };
  const c = Math.max(0, Math.min(center, buf.length - 4));
  if (chains(c)) return c;
  for (let d = 1; d <= maxOffset; d++) {
    if (c + d <= buf.length - 4 && chains(c + d)) return c + d;
    if (c - d >= 0 && chains(c - d)) return c - d;
  }
  return null;
}

/** Where the audio payload sits between an ID3v2 header and an ID3v1 trailer (both optional; 0 when absent). */
export type Mp3Layout = { fileSize: number; headerSize: number; trailerSize: number };

/** A byte offset for `time`, assuming the payload plays at one constant bitrate (true of every CBR encode,
 *  which audiobooks almost always are) — a starting point `findMp3Sync` then settles onto a real frame. */
export function estimateMp3Offset(layout: Mp3Layout, duration: number, time: number): number {
  const lo = layout.headerSize;
  const hi = Math.max(lo, layout.fileSize - layout.trailerSize);
  const frac = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
  return Math.min(hi, Math.max(lo, Math.round(lo + frac * (hi - lo))));
}

// ---- WAV: exact sample boundaries ----

export type WavFrame = { rate: number; channels: number; bits: number };

/** Bytes per sample frame (every channel's one sample, together). */
export function wavFrameSize(fmt: WavFrame): number {
  return fmt.channels * Math.ceil(fmt.bits / 8);
}

/** The data-chunk byte offset for `time`, rounded to the nearest whole sample frame and kept inside the data
 *  chunk — PCM has no independent frames like MP3, but every sample boundary is a safe, silent cut. */
export function wavByteOffset(fmt: WavFrame, dataSize: number, time: number): number {
  const frame = wavFrameSize(fmt);
  if (frame <= 0) return 0;
  const totalFrames = Math.floor(dataSize / frame);
  const sample = Math.round(Math.max(0, time) * fmt.rate);
  return Math.min(Math.max(0, sample), totalFrames) * frame;
}

/** A minimal, canonical 44-byte WAV header (RIFF/WAVE, one 16-byte fmt chunk, then `dataLength` bytes of
 *  `fmt.format`-coded audio) — enough for any PCM or IEEE-float reader, this app's own `src/lib/meta/riff.ts`
 *  included. No LIST/INFO or cue chunks: the split files carry no tags, only the audio. */
export function wavHeader(fmt: WavFrame & { format: number }, dataLength: number): Uint8Array {
  const blockAlign = wavFrameSize(fmt);
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const putAscii = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) header[o + i] = s.charCodeAt(i);
  };
  putAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  putAscii(8, "WAVE");
  putAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, fmt.format, true);
  view.setUint16(22, fmt.channels, true);
  view.setUint32(24, fmt.rate, true);
  view.setUint32(28, fmt.rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, fmt.bits, true);
  putAscii(36, "data");
  view.setUint32(40, dataLength, true);
  return header;
}

// ---- after a split: the book's new shape ----

/** `book.files` becomes one file per chapter; each chapter keeps its own start, end and title, only `fileIndex`
 *  moves to match (src/lib/timeline.ts's "one chapter per file" shape, produced here in reverse). */
export function chaptersForSplitFiles<C extends { fileIndex: number }>(chapters: C[]): C[] {
  return chapters.map((c, i) => ({ ...c, fileIndex: i }));
}
