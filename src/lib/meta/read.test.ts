// Tag parsing for every format 01.6 imports (spec 01 A5, A6) and the AAX/AAXC detector (A7), over files built
// in code by ./test-fixtures.ts.
import assert from "node:assert/strict";
import { test } from "node:test";

import { fromBase64, memorySource, toBase64, utf16, utf8 } from "./bytes.ts";
import { parseId3v1, parseId3v2 } from "./id3.ts";
import { isImportable, readAudioMeta, sniffFormat } from "./read.ts";
import {
  aaxFile,
  aaxRebranded,
  box,
  cat,
  chpl,
  flacFile,
  flacPicture,
  ftyp,
  id3Apic,
  id3Chap,
  id3Ctoc,
  id3Tag,
  id3Text,
  ilst,
  JPEG,
  m4bWithChapterTrack,
  mp3Frames,
  mvhd,
  opusFile,
  PNG,
  taggedMp3,
  udtaMeta,
  vorbisFile,
  wavFile,
} from "./test-fixtures.ts";

const read = (bytes: Uint8Array, name: string) => readAudioMeta(memorySource(bytes), name);

test("bytes: UTF-8, UTF-16 with a BOM, and base64 round trip", () => {
  assert.equal(utf8(new TextEncoder().encode("Dune — Herbert é")), "Dune — Herbert é");
  assert.equal(utf16(new Uint8Array([0xff, 0xfe, 0x41, 0, 0x42, 0])), "AB");
  assert.equal(utf16(new Uint8Array([0xfe, 0xff, 0, 0x41])), "A");
  const raw = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
  assert.deepEqual(fromBase64(toBase64(raw)), raw);
});

test("sniffFormat reads the container from the bytes, the extension only as a fallback", () => {
  assert.equal(sniffFormat(ftyp("M4B "), "x.mp3"), "mp4");
  assert.equal(sniffFormat(new TextEncoder().encode("fLaC...."), "x"), "flac");
  assert.equal(sniffFormat(new TextEncoder().encode("OggS...."), "x"), "ogg");
  assert.equal(sniffFormat(mp3Frames(1), "x.bin"), "mp3");
  assert.equal(sniffFormat(new Uint8Array(16), "book.opus"), "ogg");
  assert.equal(sniffFormat(new Uint8Array(16), "notes.txt"), "unknown");
  assert.ok(isImportable("A.M4B") && isImportable("b.opus") && isImportable("c.aaxc"));
  assert.ok(!isImportable("cover.jpg"));
});

test("A5 MP3: ID3v2.3 title, album, artist and the APIC front cover", async () => {
  const m = await read(taggedMp3({ title: "Chapter One", album: "The Long Road", artist: "A. Writer", cover: true }), "01.mp3");
  assert.equal(m.format, "mp3");
  assert.equal(m.title, "Chapter One");
  assert.equal(m.album, "The Long Road");
  assert.equal(m.artist, "A. Writer");
  assert.equal(m.cover?.mime, "image/jpeg");
  assert.deepEqual(m.cover?.data, JPEG);
  assert.equal(m.drm, null);
});

test("A5 ID3v2.4: UTF-8 text, multiple values, track and disc, a narrator TXXX, the front cover over others", () => {
  const txxx = cat([3], new TextEncoder().encode("NARRATOR"), [0], new TextEncoder().encode("N. Reader"));
  const tag = id3Tag(
    [
      id3Text("TIT2", "Été", 4),
      id3Text("TPE1", "One\u0000Two", 4),
      id3Text("TRCK", "3/12", 4),
      id3Text("TPOS", "2", 4),
      id3Apic(PNG, 0, "image/png", 4),
      id3Apic(JPEG, 3, "image/jpeg", 4),
      cat(new TextEncoder().encode("TXXX"), [0, 0, 0, txxx.length], [0, 0], txxx),
    ],
    4,
  );
  const t = parseId3v2(tag);
  assert.equal(t.title, "Été");
  assert.equal(t.artist, "One, Two");
  assert.equal(t.track, 3);
  assert.equal(t.disc, 2);
  assert.equal(t.narrator, "N. Reader");
  assert.equal(t.cover?.mime, "image/jpeg");
});

test("A6 ID3 CHAP frames follow the CTOC order, with titles from their TIT2", () => {
  const tag = id3Tag([
    id3Chap("c2", 60_000, 125_500, "The Storm"),
    id3Chap("c1", 0, 60_000, "Arrival"),
    id3Ctoc(["c1", "c2"]),
  ]);
  const t = parseId3v2(tag);
  assert.deepEqual(t.chapters, [
    { title: "Arrival", start: 0, end: 60 },
    { title: "The Storm", start: 60, end: 125.5 },
  ]);
});

test("ID3v1 at the end of an MP3 is the fallback", async () => {
  const v1 = new Uint8Array(128);
  v1.set(new TextEncoder().encode("TAG"));
  v1.set(new TextEncoder().encode("Old Title"), 3);
  v1.set(new TextEncoder().encode("Old Artist"), 33);
  v1[126] = 7;
  assert.equal(parseId3v1(v1)?.title, "Old Title");
  const m = await read(cat(mp3Frames(3), v1), "old.mp3");
  assert.equal(m.title, "Old Title");
  assert.equal(m.artist, "Old Artist");
  assert.equal(m.track, 7);
});

test("A5 M4B: ilst tags, covr and the mvhd duration", async () => {
  const file = cat(
    ftyp("M4B ", "mp42"),
    box(
      "moov",
      mvhd(1000, 7_200_000),
      udtaMeta(ilst({ "©nam": "Moby-Dick", "©ART": "Herman Melville", "©nrt": "Stewart Wills" }, JPEG, 4)),
    ),
    box("mdat", new Uint8Array(32)),
  );
  const m = await read(file, "moby.m4b");
  assert.equal(m.format, "mp4");
  assert.equal(m.title, "Moby-Dick");
  assert.equal(m.artist, "Herman Melville");
  assert.equal(m.narrator, "Stewart Wills");
  assert.equal(m.track, 4);
  assert.equal(m.duration, 7200);
  assert.equal(m.cover?.mime, "image/jpeg");
  assert.equal(m.drm, null);
});

test("A6 M4B: Nero chpl chapters", async () => {
  const file = cat(
    ftyp("M4A "),
    box("moov", mvhd(1000, 300_000), udtaMeta(ilst({ "©nam": "Book" }), [chpl([[0, "One"], [100.5, "Two"], [200, "Three"]])])),
  );
  const m = await read(file, "b.m4a");
  assert.deepEqual(
    m.chapters.map((c) => [c.title, c.start]),
    [
      ["One", 0],
      ["Two", 100.5],
      ["Three", 200],
    ],
  );
});

test("A6 M4B: a QuickTime chapter track's text samples, read from the mdat", async () => {
  const file = m4bWithChapterTrack(
    [
      [0, "Opening Credits"],
      [12, "Chapter 1"],
      [600, "Chapter 2"],
    ],
    900,
    { "©alb": "A Book" },
  );
  const m = await read(file, "a.m4b");
  assert.equal(m.album, "A Book");
  assert.deepEqual(m.chapters, [
    { title: "Opening Credits", start: 0, end: 12 },
    { title: "Chapter 1", start: 12, end: 600 },
    { title: "Chapter 2", start: 600, end: 900 },
  ]);
});

test("A7 AAX and AAXC are recognised by content and by name, and nothing is read from them", async () => {
  assert.equal((await read(aaxFile(), "book.m4b")).drm, "aax");
  assert.equal((await read(aaxFile("aaxc"), "book")).drm, "aaxc");
  assert.equal((await read(aaxRebranded(), "renamed.m4a")).drm, "aax");
  assert.equal((await read(aaxFile(), "x.aaxc")).drm, "aaxc");
  // A truncated or unreadable file with an Audible extension still gets the note.
  assert.equal((await read(new Uint8Array(4), "Garbled.aax")).drm, "aax");
  assert.equal((await read(taggedMp3({ title: "x" }), "fine.mp3")).drm, null);
  const m = await read(aaxFile(), "book.aax");
  assert.deepEqual(m.chapters, []);
});

test("A5 FLAC: Vorbis comments, the PICTURE block, STREAMINFO duration, CHAPTERnnn markers", async () => {
  const file = flacFile(
    [
      "TITLE=Part One",
      "ALBUM=The Flac Book",
      "ARTIST=F. Author",
      "TRACKNUMBER=1",
      "CHAPTER001=00:00:00.000",
      "CHAPTER001NAME=Start",
      "CHAPTER002=00:01:30.500",
      "CHAPTER002NAME=Middle",
    ],
    200,
    PNG,
  );
  const m = await read(file, "1.flac");
  assert.equal(m.format, "flac");
  assert.equal(m.album, "The Flac Book");
  assert.equal(m.artist, "F. Author");
  assert.equal(m.track, 1);
  assert.equal(m.duration, 200);
  assert.equal(m.cover?.mime, "image/png");
  assert.deepEqual(m.chapters, [
    { title: "Start", start: 0 },
    { title: "Middle", start: 90.5 },
  ]);
});

test("A5 Opus: OpusTags, METADATA_BLOCK_PICTURE and the duration from the last granule", async () => {
  const pic = toBase64(flacPicture(JPEG, 3, "image/jpeg"));
  const m = await read(opusFile(["TITLE=Opus Book", "ARTIST=O. Author", `METADATA_BLOCK_PICTURE=${pic}`], 42), "b.opus");
  assert.equal(m.format, "ogg");
  assert.equal(m.title, "Opus Book");
  assert.equal(m.artist, "O. Author");
  assert.equal(m.cover?.mime, "image/jpeg");
  assert.equal(m.duration, 42);
});

test("A5 Ogg Vorbis: a comment packet split across pages", async () => {
  const long = "x".repeat(600);
  const m = await read(vorbisFile(["TITLE=Vorbis Book", `COMMENT=${long}`, "ALBUMARTIST=V. Author"], 10), "v.ogg");
  assert.equal(m.title, "Vorbis Book");
  assert.equal(m.albumArtist, "V. Author");
  assert.equal(m.duration, 10);
});

test("A5 A6 WAV: LIST/INFO tags, the duration, and cue points named by labl", async () => {
  const file = wavFile(new Int16Array(8000 * 4), 8000, { INAM: "Wave Book", IART: "W. Author", IPRD: "Album" }, [
    [0, "First"],
    [2.5, "Second"],
  ]);
  const m = await read(file, "w.wav");
  assert.equal(m.format, "wav");
  assert.equal(m.title, "Wave Book");
  assert.equal(m.artist, "W. Author");
  assert.equal(m.album, "Album");
  assert.equal(m.duration, 4);
  assert.deepEqual(m.chapters, [
    { title: "First", start: 0 },
    { title: "Second", start: 2.5 },
  ]);
});

test("an unreadable file is unknown with no tags, never an error", async () => {
  const m = await read(new Uint8Array([1, 2, 3]), "x.bin");
  assert.equal(m.format, "unknown");
  assert.deepEqual(m.chapters, []);
  const broken = await read(cat(ftyp("M4A "), [0, 0, 0, 99, 0x6d, 0x6f, 0x6f, 0x76]), "y.m4a");
  assert.equal(broken.format, "mp4");
});
