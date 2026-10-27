// Spec 05 A13: the byte math behind "Split into chapter files" (05.11) — MP3 frame sync search, WAV sample
// boundaries and header, and the book-shape helpers, all with no file, no bundler, no device.
import assert from "node:assert/strict";
import { test } from "node:test";

import { memorySource } from "./meta/bytes.ts";
import { mp3Frames } from "./meta/test-fixtures.ts";
import { parseFmt, wavChunks } from "./meta/riff.ts";
import {
  canOfferSplit,
  chaptersForSplitFiles,
  estimateMp3Offset,
  findMp3Sync,
  parseMp3FrameHeader,
  wavByteOffset,
  wavFrameSize,
  wavHeader,
  type Mp3Layout,
} from "./split-plan.ts";

test("A13: the split offers itself only for one multi-chapter file in a format it can cut", () => {
  const chapters = [{ index: 0 }, { index: 1 }];
  assert.equal(canOfferSplit([{ ref: "file:///books/b/000.mp3" }], chapters), true);
  assert.equal(canOfferSplit([{ ref: "file:///books/b/000.wav" }], chapters), true);
  // Several files, one chapter, or an unsplittable format: no offer.
  assert.equal(canOfferSplit([{ ref: "a.mp3" }, { ref: "b.mp3" }], chapters), false);
  assert.equal(canOfferSplit([{ ref: "file:///books/b/000.mp3" }], [{ index: 0 }]), false);
  assert.equal(canOfferSplit([{ ref: "file:///books/b/000.m4b" }], chapters), false);
});

test("a real MPEG-1 Layer III frame header (this repo's own test fixture) parses to its exact frame size", () => {
  const frame = mp3Frames(1);
  assert.deepEqual(parseMp3FrameHeader(frame, 0), { frameSize: 417 });
});

test("a header with a reserved version, reserved layer, bad bitrate or bad sample rate is rejected", () => {
  const good = mp3Frames(1);
  const mutate = (o: number, v: number) => {
    const b = new Uint8Array(good);
    b[o] = v;
    return b;
  };
  assert.equal(parseMp3FrameHeader(mutate(0, 0xfe), 0), null, "no sync");
  assert.equal(parseMp3FrameHeader(mutate(1, good[1] & 0b11101111), 0), null, "reserved version (01)");
  assert.equal(parseMp3FrameHeader(mutate(1, good[1] & 0b11111001), 0), null, "reserved layer (00)");
  assert.equal(parseMp3FrameHeader(mutate(2, 0xf4), 0), null, "bad bitrate index (15)");
  assert.equal(parseMp3FrameHeader(mutate(2, (good[2] & 0x0f) | 0x00), 0), null, "free-format bitrate index (0)");
  assert.equal(parseMp3FrameHeader(mutate(2, (good[2] & 0xf3) | 0x0c), 0), null, "reserved sample-rate index (11)");
});

test("findMp3Sync lands on a real, chained frame boundary near the estimate, not a lone look-alike byte", () => {
  const frames = mp3Frames(5); // 417 bytes each, boundaries at 0, 417, 834, 1251, 1668
  const junkThenFrames = new Uint8Array(100 + frames.length);
  junkThenFrames.set(frames, 100);
  junkThenFrames[30] = 0xff; // a stray sync byte with nothing valid after it
  junkThenFrames[31] = 0xfb;

  assert.equal(findMp3Sync(junkThenFrames, 100 + 834), 100 + 834, "exactly on a boundary");
  assert.equal(findMp3Sync(junkThenFrames, 100 + 834 + 5), 100 + 834, "a few bytes after");
  assert.equal(findMp3Sync(junkThenFrames, 100 + 834 - 5), 100 + 834, "a few bytes before");
  assert.equal(findMp3Sync(junkThenFrames, 30, 5), null, "the stray byte never chains, so nothing within range");
});

test("estimateMp3Offset is linear between the header and trailer and clamps at both ends", () => {
  const layout: Mp3Layout = { fileSize: 10_100, headerSize: 100, trailerSize: 0 };
  assert.equal(estimateMp3Offset(layout, 100, 0), 100);
  assert.equal(estimateMp3Offset(layout, 100, 50), 5100);
  assert.equal(estimateMp3Offset(layout, 100, 100), 10_100);
  assert.equal(estimateMp3Offset(layout, 100, -5), 100, "before the start clamps to the header's end");
  assert.equal(estimateMp3Offset(layout, 100, 999), 10_100, "past the end clamps to the trailer's start");
  assert.equal(estimateMp3Offset({ ...layout, trailerSize: 100 }, 100, 100), 10_000);
});

test("wavByteOffset rounds to a whole sample frame and never crosses the data chunk's ends", () => {
  const fmt = { rate: 44100, channels: 2, bits: 16 };
  assert.equal(wavFrameSize(fmt), 4);
  const dataSize = 44100 * 4 * 10; // 10 seconds
  assert.equal(wavByteOffset(fmt, dataSize, 0), 0);
  assert.equal(wavByteOffset(fmt, dataSize, 1), 44100 * 4);
  assert.equal(wavByteOffset(fmt, dataSize, 10), dataSize);
  assert.equal(wavByteOffset(fmt, dataSize, 999), dataSize, "past the end clamps to the data chunk's size");
  // A fraction of a second still lands on a whole frame, not a split sample.
  const at = wavByteOffset(fmt, dataSize, 0.5000113);
  assert.equal(at % wavFrameSize(fmt), 0);
});

test("wavHeader builds a RIFF/WAVE file this app's own WAV reader (src/lib/meta/riff.ts) reads back correctly", async () => {
  const fmt = { rate: 22050, channels: 1, bits: 16, format: 1 };
  const data = new Uint8Array(2000).fill(7);
  const file = new Uint8Array(44 + data.length);
  file.set(wavHeader(fmt, data.length), 0);
  file.set(data, 44);

  const chunks = await wavChunks(memorySource(file));
  const fmtChunk = chunks.find((c) => c.id === "fmt ");
  const dataChunk = chunks.find((c) => c.id === "data");
  assert.ok(fmtChunk && dataChunk);
  assert.equal(dataChunk!.size, data.length);
  const read = parseFmt(file.subarray(fmtChunk!.offset, fmtChunk!.offset + fmtChunk!.size));
  assert.deepEqual(read, { format: 1, channels: 1, rate: 22050, blockAlign: 2, bits: 16 });
});

test("after a split, every chapter keeps its own span and only fileIndex moves to the file now backing it", () => {
  const chapters = [
    { bookId: "b", index: 0, title: "Arrival", fileIndex: 0, start: 0, end: 40 },
    { bookId: "b", index: 1, title: "Desert", fileIndex: 0, start: 40, end: 100 },
  ];
  assert.deepEqual(chaptersForSplitFiles(chapters), [
    { ...chapters[0], fileIndex: 0 },
    { ...chapters[1], fileIndex: 1 },
  ]);
});
