// Splitting a book's one file into one file per chapter (spec 05 A13, 05.11): the file-system side of the byte
// math in src/lib/split-plan.ts, which plans every cut with no device; this module only reads and writes what
// it planned. Lossless for MP3 and PCM/float WAV — the two formats the plan can cut without re-encoding.
// Anything else (MP4/M4A/M4B, or a file whose real bytes aren't what its name claimed) comes back `unsupported`
// rather than risk a broken file. Nothing here leaves the device (agents.md rule 6).
import { FileMode, type File } from "expo-file-system";

import { library } from "./library";
import { createBookFile, deleteStoredFiles, storedSource } from "./media";
import { ascii, type ByteSource } from "./meta/bytes";
import { id3Size } from "./meta/id3";
import { sniffFormat } from "./meta/read";
import { parseFmt, wavChunks } from "./meta/riff";
import {
  chaptersForSplitFiles,
  estimateMp3Offset,
  findMp3Sync,
  wavByteOffset,
  wavHeader,
  type Mp3Layout,
} from "./split-plan";
import type { Book, BookFile } from "./types";

export type SplitOutcome = "done" | "no-op" | "unsupported" | "failed";

/** How far either side of a time estimate to look for a real MP3 frame boundary (src/lib/split-plan.ts). */
const SEARCH_WINDOW = 8192;
/** Read and write in chunks this big, so a multi-hour file never sits whole in memory. */
const BLOCK = 1 << 20;

type Writable = { writeBytes(bytes: Uint8Array): Promise<void> };

async function copyRange(source: ByteSource, start: number, end: number, into: Writable): Promise<void> {
  for (let at = start; at < end; at += BLOCK) {
    const chunk = await source.read(at, Math.min(BLOCK, end - at));
    if (chunk.length === 0) break;
    await into.writeBytes(chunk);
  }
}

function deleteQuietly(files: File[]): void {
  for (const f of files) {
    try {
      if (f.exists) f.delete();
    } catch {
      // Best effort: a half-written temporary file left behind costs nothing the listener can see.
    }
  }
}

/**
 * Splits a book's one file into one file per chapter, in place in the library. `book.files.length !== 1` or
 * fewer than two chapters is a `no-op` (src/lib/split-plan.ts canOfferSplit already keeps the menu from
 * offering those); a format this device cannot cut losslessly is `unsupported`; a cut that cannot find a safe
 * frame boundary, or a library refusal (A13, src/lib/library-store.ts setFiles), is `failed` — either way the
 * original file is untouched until every new chapter file is written and the library has accepted them.
 */
export async function splitIntoChapterFiles(book: Book): Promise<SplitOutcome> {
  if (book.files.length !== 1 || book.chapters.length < 2) return "no-op";
  const original = book.files[0];
  const source = storedSource(original.ref);
  try {
    const head = await source.read(0, 16);
    const format = sniffFormat(head, original.ref);
    if (format === "mp3") return await splitMp3(book, original, source);
    if (format === "wav") return await splitWav(book, original, source);
    return "unsupported";
  } finally {
    source.close?.();
  }
}

async function mp3Layout(source: ByteSource): Promise<Mp3Layout> {
  const headerSize = id3Size(await source.read(0, 10));
  let trailerSize = 0;
  if (source.size >= headerSize + 128) {
    const tail = await source.read(source.size - 128, 128);
    if (ascii(tail, 0, 3) === "TAG") trailerSize = 128;
  }
  return { fileSize: source.size, headerSize, trailerSize };
}

/** The cut points between every chapter: the header's end, a verified frame sync near each internal chapter
 *  start, and the trailer's start. Null if a sync cannot be confirmed near some boundary (src/lib/split-plan.ts
 *  findMp3Sync) — scanning wider than `SEARCH_WINDOW` risks landing in a neighbouring chapter instead, so this
 *  gives up on the split rather than cut somewhere the listener never asked for.
 */
async function mp3CutPoints(source: ByteSource, layout: Mp3Layout, duration: number, starts: number[]): Promise<number[] | null> {
  const cuts = [layout.headerSize];
  for (const time of starts) {
    const estimate = estimateMp3Offset(layout, duration, time);
    const from = Math.max(layout.headerSize, estimate - SEARCH_WINDOW);
    const to = Math.min(layout.fileSize - layout.trailerSize, estimate + SEARCH_WINDOW);
    const window = await source.read(from, to - from);
    const found = findMp3Sync(window, estimate - from, SEARCH_WINDOW);
    if (found === null) return null;
    cuts.push(from + found);
  }
  cuts.push(layout.fileSize - layout.trailerSize);
  return cuts;
}

async function splitMp3(book: Book, original: BookFile, source: ByteSource): Promise<SplitOutcome> {
  const layout = await mp3Layout(source);
  const cuts = await mp3CutPoints(source, layout, book.duration, book.chapters.slice(1).map((c) => c.start));
  if (!cuts) return "failed";
  return writeChapterFiles(book, original, "mp3", (i, into) => copyRange(source, cuts[i], cuts[i + 1], into));
}

async function splitWav(book: Book, original: BookFile, source: ByteSource): Promise<SplitOutcome> {
  const chunks = await wavChunks(source);
  const fmtChunk = chunks.find((c) => c.id === "fmt ");
  const dataChunk = chunks.find((c) => c.id === "data");
  if (!fmtChunk || !dataChunk) return "unsupported";
  const fmt = parseFmt(await source.read(fmtChunk.offset, fmtChunk.size));
  if (fmt.rate <= 0 || fmt.channels <= 0 || fmt.bits <= 0) return "unsupported";

  const cuts = book.chapters.map((c) => wavByteOffset(fmt, dataChunk.size, c.start));
  cuts.push(dataChunk.size);
  return writeChapterFiles(book, original, "wav", async (i, into) => {
    await into.writeBytes(wavHeader(fmt, cuts[i + 1] - cuts[i]));
    await copyRange(source, dataChunk.offset + cuts[i], dataChunk.offset + cuts[i + 1], into);
  });
}

/**
 * Writes one file per chapter (`fill` supplies each chapter `i`'s bytes), then asks the library to point the
 * book at them in one save (A13). A write that throws, or a save the library refuses (a rounding mismatch that
 * breaks `coversBook`), deletes whatever was written and leaves the book exactly as it was; only once the
 * library has accepted the new files is the original file removed.
 */
async function writeChapterFiles(
  book: Book,
  original: BookFile,
  ext: string,
  fill: (index: number, into: Writable) => Promise<void>,
): Promise<SplitOutcome> {
  const written: File[] = [];
  try {
    const files: BookFile[] = [];
    for (let i = 0; i < book.chapters.length; i++) {
      const chapter = book.chapters[i];
      const target = createBookFile(book.id, `chapter-${String(i).padStart(3, "0")}.${ext}`);
      written.push(target);
      const handle = target.open(FileMode.WriteOnly);
      try {
        await fill(i, handle);
      } finally {
        handle.close();
      }
      // The chapter's own span, not a re-probed one: the book's timeline does not move, so the new file's
      // duration must match exactly, down to any rounding the byte cut introduced.
      files.push({ ref: target.uri, name: chapter.title, duration: chapter.end - chapter.start });
    }
    if (!library.setFiles(book.id, files, chaptersForSplitFiles(book.chapters))) {
      deleteQuietly(written);
      return "failed";
    }
    await deleteStoredFiles([original.ref]).catch(() => {});
    return "done";
  } catch {
    deleteQuietly(written);
    return "failed";
  }
}
