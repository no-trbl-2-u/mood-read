// A12: the Credits screen credits every catalog piece, soundscape and LibriVox reader as its license asks.
import assert from "node:assert/strict";
import { test } from "node:test";

import { validPiece, validVerdict } from "./catalog-fixtures.ts";
import type { CatalogLicense } from "./catalog.ts";
import { buildCredits, creditLine, licenseName } from "./credits.ts";
import { OWNED_LICENSE, SOUNDSCAPE_INFO } from "./soundscapes.ts";
import type { Book } from "./types.ts";

const book = (over: Partial<Book>): Book => ({
  id: "b1",
  title: "A Book",
  author: "An Author",
  narrator: "",
  cover: null,
  files: [],
  chapters: [],
  duration: 0,
  addedAt: 0,
  lastPlayedAt: null,
  source: { kind: "import" },
  onDevice: true,
  ...over,
});

const pieceUnder = (license: CatalogLicense, credit: string | null, over = {}) =>
  validPiece({ license, credit, verdict: validVerdict({ license: { id: license.id, version: license.version } }), ...over });

const CC0: CatalogLicense = { id: "cc0", version: "1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" };
const PD: CatalogLicense = { id: "public-domain", version: null, url: null };
const BY_SA: CatalogLicense = { id: "cc-by-sa", version: "3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/" };

test("license names read as people write them", () => {
  assert.equal(licenseName({ id: "cc-by", version: "4.0" }), "CC BY 4.0");
  assert.equal(licenseName({ id: "cc-by-sa", version: "3.0" }), "CC BY-SA 3.0");
  assert.equal(licenseName({ id: "cc0", version: "1.0" }), "CC0 1.0");
  assert.equal(licenseName({ id: "public-domain", version: null }), "Public domain");
});

test("a CC-BY piece is credited with its title, artist, license and link, its source and its credit line", () => {
  const { music } = buildCredits({ pieces: [validPiece()], soundscapes: [], books: [] });
  assert.deepEqual(music, [
    {
      id: "night-vigil",
      title: "Night Vigil",
      artist: "A. Composer",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      source: "https://music.example/tracks/night-vigil",
      credit: '"Night Vigil" by A. Composer (music.example), licensed under CC BY 4.0',
      creditRequired: true,
    },
  ]);
});

test("CC-BY-SA asks for a credit line: one missing is written from the piece rather than left out", () => {
  const piece = pieceUnder(BY_SA, null, { id: "tide-song", title: "Tide Song", artist: "M. Reyes" });
  const [credit] = buildCredits({ pieces: [piece], soundscapes: [], books: [] }).music;
  assert.equal(credit!.creditRequired, true);
  assert.equal(credit!.credit, '"Tide Song" by M. Reyes, licensed under CC BY-SA 3.0');
  assert.equal(creditLine({ ...piece, credit: "  " }), '"Tide Song" by M. Reyes, licensed under CC BY-SA 3.0');
});

test("CC0 and public domain ask for no credit line; a courtesy line the owner wrote is kept", () => {
  const { music } = buildCredits({
    pieces: [
      pieceUnder(CC0, null, { id: "a", title: "A" }),
      pieceUnder(PD, null, { id: "b", title: "B" }),
      pieceUnder(PD, "Thanks to the archive", { id: "c", title: "C" }),
    ],
    soundscapes: [],
    books: [],
  });
  assert.deepEqual(
    music.map((m) => [m.title, m.license, m.licenseUrl, m.credit, m.creditRequired]),
    [
      ["A", "CC0 1.0", CC0.url, null, false],
      ["B", "Public domain", null, null, false],
      ["C", "Public domain", null, "Thanks to the archive", false],
    ],
  );
});

test("music is listed by title", () => {
  const { music } = buildCredits({
    pieces: [validPiece({ id: "z", title: "Zephyr" }), validPiece({ id: "a", title: "Amber Hours" })],
    soundscapes: [],
    books: [],
  });
  assert.deepEqual(music.map((m) => m.title), ["Amber Hours", "Zephyr"]);
});

test("every bundled soundscape is listed, made for Mood Read and owned by the project", () => {
  const { soundscapes } = buildCredits({ pieces: [], soundscapes: SOUNDSCAPE_INFO, books: [] });
  assert.deepEqual(soundscapes.map((s) => s.name), ["Rain", "Hearth Fire", "Night Wind", "Tide", "Static Hush", "Low Café"]);
  assert.ok(soundscapes.every((s) => s.owned && s.license === OWNED_LICENSE));
  const other = buildCredits({ pieces: [], soundscapes: [{ id: "x", name: "X", loopSeconds: 1, license: "CC0 1.0" }], books: [] });
  assert.deepEqual(other.soundscapes, [{ id: "x", name: "X", owned: false, license: "CC0 1.0" }]);
});

test("every LibriVox book on the device lists its readers; an imported book is not a LibriVox credit", () => {
  const { readers } = buildCredits({
    pieces: [],
    soundscapes: [],
    books: [
      book({ id: "own", title: "My Own Audiobook", narrator: "A Narrator" }),
      book({ id: "w", title: "The Wind in the Willows", author: "Kenneth Grahame", narrator: "Pat Reader", source: { kind: "librivox", librivoxId: "wind" } }),
      book({ id: "p", title: "Peter Pan", author: "J. M. Barrie", narrator: "  ", source: { kind: "librivox", librivoxId: "pan" }, onDevice: false }),
    ],
  });
  assert.deepEqual(readers, [
    { bookId: "p", title: "Peter Pan", author: "J. M. Barrie", readers: null },
    { bookId: "w", title: "The Wind in the Willows", author: "Kenneth Grahame", readers: "Pat Reader" },
  ]);
});

test("empty states: no catalog yet and no LibriVox books leave only the soundscapes", () => {
  const credits = buildCredits({ pieces: [], soundscapes: SOUNDSCAPE_INFO, books: [book({})] });
  assert.deepEqual(credits.music, []);
  assert.deepEqual(credits.readers, []);
  assert.equal(credits.soundscapes.length, 6);
});
