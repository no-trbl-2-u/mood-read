// Spec 01 A5 (one book from a file or a folder, tags and cover) and A7 (an AAX/AAXC file stops the import).
import assert from "node:assert/strict";
import { test } from "node:test";

import { bookTags, checkImport, inspectFiles, UNKNOWN_AUTHOR, type PickedFile } from "./import-plan.ts";
import { memorySource } from "./meta/bytes.ts";
import {
  aaxFile,
  box,
  cat,
  flacFile,
  ftyp,
  ilst,
  JPEG,
  mvhd,
  taggedMp3,
  udtaMeta,
} from "./meta/test-fixtures.ts";

const picked = (name: string, bytes: Uint8Array): PickedFile => ({ name, size: bytes.length, source: memorySource(bytes) });

async function plan(files: PickedFile[]) {
  return checkImport(await inspectFiles(files));
}

test("A5 one tagged M4B is one book: title, author, narrator and cover from its tags", async () => {
  const m4b = cat(
    ftyp("M4B "),
    box(
      "moov",
      mvhd(1, 100),
      udtaMeta(ilst({ "©nam": "Moby-Dick", "©ART": "Herman Melville", "©wrt": "Stewart Wills" }, JPEG)),
    ),
  );
  const r = await plan([picked("moby.m4b", m4b)]);
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  const tags = bookTags(r.files);
  assert.equal(tags.title, "Moby-Dick");
  assert.equal(tags.author, "Herman Melville");
  assert.equal(tags.narrator, "Stewart Wills");
  assert.deepEqual(tags.cover?.data, JPEG);
});

test("A5 a folder of MP3s is one book in track order, titled by the album, the cover from any file", async () => {
  const mp3 = (title: string, cover = false) => taggedMp3({ title, album: "The Long Road", artist: "A. Writer", cover }, 0.1);
  const list = await inspectFiles([picked("z0.mp3", mp3("Two", true)), picked("z1.mp3", mp3("One"))]);
  // Track numbers out of name order: the tags decide.
  list[0].meta.track = 2;
  list[1].meta.track = 1;
  const r = checkImport([...list, { file: picked("cover.jpg", JPEG), meta: { format: "unknown", chapters: [], drm: null } }]);
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  assert.deepEqual(
    r.files.map((x) => x.meta.title),
    ["One", "Two"],
  );
  const tags = bookTags(r.files);
  assert.equal(tags.title, "The Long Road");
  assert.equal(tags.author, "A. Writer");
  assert.deepEqual(tags.cover?.data, JPEG);
});

test("A5 without tags the title comes from the file names and the author is unknown", async () => {
  const r = await plan([picked("Dune - 02.flac", flacFile([], 1)), picked("Dune - 01.flac", flacFile([], 1))]);
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  assert.deepEqual(
    r.files.map((x) => x.file.name),
    ["Dune - 01.flac", "Dune - 02.flac"],
  );
  const tags = bookTags(r.files);
  assert.equal(tags.title, "Dune");
  assert.equal(tags.author, UNKNOWN_AUTHOR);
  assert.equal(tags.cover, null);
});

test("A7 an AAX or AAXC file stops the import with its name, even beside a DRM-free file", async () => {
  const r = await plan([picked("fine.mp3", taggedMp3({ title: "x" })), picked("My Book.aax", aaxFile())]);
  assert.deepEqual(r, { kind: "drm", fileName: "My Book.aax", drm: "aax" });
  const renamed = await plan([picked("My Book.m4b", aaxFile("aaxc"))]);
  assert.deepEqual(renamed, { kind: "drm", fileName: "My Book.m4b", drm: "aaxc" });
});

test("nothing that is audio is named; nothing at all is empty", async () => {
  assert.deepEqual(await plan([picked("notes.txt", new TextEncoder().encode("hello there"))]), {
    kind: "unsupported",
    fileName: "notes.txt",
  });
  assert.deepEqual(await plan([]), { kind: "empty" });
});
