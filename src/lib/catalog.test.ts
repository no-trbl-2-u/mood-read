// A1: every catalog piece carries a license that allows playing it (CC0, public domain, CC-BY, CC-BY-SA), a
// rights-checker yes with its evidence, vocals none and mood tags; nothing else enters. One test per refusal path.
import assert from "node:assert/strict";
import { test } from "node:test";

import { PIECE_KINDS as PROXY_PIECE_KINDS } from "../../proxy/src/contract.ts";
import { catalogOf, validPiece, validVerdict } from "./catalog-fixtures.ts";
import { CATALOG_SCHEMA, checkCatalog, checkCatalogPiece, emptyCatalog, pieceKey, PIECE_KINDS, readCatalog, verdictReasons } from "./catalog.ts";

/** The reasons an entry is refused, joined; fails the test if it is let in. */
function refused(entry: unknown): string {
  const res = checkCatalogPiece(entry);
  assert.equal(res.ok, false, "expected a refusal");
  return res.ok ? "" : res.reasons.join(" | ");
}

const without = (key: string) => {
  const p: Record<string, unknown> = { ...validPiece() };
  delete p[key];
  return p;
};

test("a CC-BY piece with a credit, an allowed verdict, vocals none and mood tags enters", () => {
  const res = checkCatalogPiece(validPiece());
  assert.deepEqual(res, { ok: true, value: validPiece() });
});

test("each allowed license enters: cc0, public domain, cc-by, cc-by-sa", () => {
  const cases = [
    { license: { id: "cc0", version: "1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" }, credit: null },
    { license: { id: "public-domain", version: null, url: null }, credit: null },
    { license: { id: "public-domain", version: null, url: "https://creativecommons.org/publicdomain/mark/1.0/" }, credit: "Courtesy line" },
    { license: { id: "cc-by", version: "3.0", url: "https://creativecommons.org/licenses/by/3.0/" }, credit: "Credit" },
    { license: { id: "cc-by-sa", version: "4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" }, credit: "Credit" },
  ] as const;
  for (const c of cases) {
    const piece = validPiece({ license: c.license, credit: c.credit, verdict: validVerdict({ license: { id: c.license.id, version: c.license.version } }) });
    assert.equal(checkCatalogPiece(piece).ok, true, c.license.id);
  }
});

test("refused: a license outside the allowed set (NC, ND, all rights reserved, missing)", () => {
  for (const id of ["cc-by-nc", "cc-by-nd", "cc-by-nc-sa", "all-rights-reserved", "pixabay"]) {
    assert.match(refused(validPiece({ license: { id, version: "4.0", url: "https://x.example/" } as never })), /not one that allows playing/);
  }
  assert.match(refused(without("license")), /license is missing/);
});

test("refused: a CC license with no or a made-up version, a public-domain piece with one", () => {
  assert.match(refused(validPiece({ license: { id: "cc-by", version: null, url: "https://creativecommons.org/licenses/by/4.0/" } })), /needs a version/);
  assert.match(refused(validPiece({ license: { id: "cc-by", version: "5.0", url: "https://creativecommons.org/licenses/by/4.0/" } })), /needs a version/);
  assert.match(refused(validPiece({ license: { id: "public-domain", version: "1.0", url: null }, credit: null })), /public domain has no version/);
});

test("refused: a CC license with no deed URL", () => {
  assert.match(refused(validPiece({ license: { id: "cc-by", version: "4.0", url: null } })), /deed's https URL/);
  assert.match(refused(validPiece({ license: { id: "cc-by", version: "4.0", url: "http://creativecommons.org/licenses/by/4.0/" } })), /deed's https URL/);
});

test("refused: CC-BY or CC-BY-SA without a credit line", () => {
  assert.match(refused(validPiece({ credit: null })), /cc-by asks for a credit line/);
  assert.match(refused(validPiece({ credit: "   " })), /asks for a credit line/);
  const sa = { id: "cc-by-sa", version: "4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" } as const;
  assert.match(refused(validPiece({ license: sa, credit: null, verdict: validVerdict({ license: { id: "cc-by-sa", version: "4.0" } }) })), /cc-by-sa asks for a credit line/);
  assert.match(refused(validPiece({ credit: 42 as never })), /credit must be/);
});

test("refused: no verdict, or one that is not the rights-checker's yes", () => {
  assert.match(refused(without("verdict")), /no rights-checker verdict/);
  for (const v of ["unclear", "not-allowed", "yes?", ""]) assert.match(refused(validPiece({ verdict: validVerdict({ verdict: v as never }) })), /not allowed \(unclear counts as no\)/);
  assert.match(refused(validPiece({ verdict: validVerdict({ by: "a person" as never }) })), /not the rights-checker's/);
});

test("refused: the verdict found vocals, or didn't say", () => {
  for (const v of ["has-vocals", "unknown", undefined]) assert.match(refused(validPiece({ verdict: validVerdict({ vocals: v as never }) })), /found vocals/);
});

test("refused: a verdict with no evidence, or evidence missing its quote, URL or day", () => {
  assert.match(refused(validPiece({ verdict: validVerdict({ evidence: [] }) })), /no evidence/);
  assert.match(refused(validPiece({ verdict: validVerdict({ evidence: undefined as never }) })), /no evidence/);
  const e = validVerdict().evidence[0];
  for (const bad of [{ ...e, quote: "" }, { ...e, url: "not a url" }, { ...e, readOn: "yesterday" }, { ...e, readOn: "2026-02-30" }]) {
    assert.match(refused(validPiece({ verdict: validVerdict({ evidence: [bad] }) })), /every piece of evidence/);
  }
});

test("refused: a verdict with no use, no recording, no conditions, no date or no license", () => {
  assert.match(refused(validPiece({ verdict: validVerdict({ useChecked: " " }) })), /which use was checked/);
  assert.match(refused(validPiece({ verdict: validVerdict({ source: "" }) })), /recording it checked/);
  assert.match(refused(validPiece({ verdict: validVerdict({ conditions: undefined as never }) })), /conditions/);
  assert.match(refused(validPiece({ verdict: validVerdict({ checkedOn: "2026-13-01" }) })), /no date/);
  assert.match(refused(validPiece({ verdict: validVerdict({ license: { id: "cc-by-nc", version: "4.0" } as never }) })), /verdict's license/);
});

test("refused: a verdict for another recording, or one that found another license", () => {
  assert.match(refused(validPiece({ verdict: validVerdict({ source: "https://music.example/tracks/other" }) })), /different recording/);
  assert.match(refused(validPiece({ verdict: validVerdict({ license: { id: "cc-by", version: "3.0" } }) })), /different license/);
});

test("verdictReasons takes only a complete allowed record", () => {
  assert.deepEqual(verdictReasons(validVerdict()), []);
  assert.deepEqual(verdictReasons(null), ["no rights-checker verdict"]);
  assert.deepEqual(verdictReasons("allowed"), ["no rights-checker verdict"]);
});

test("refused: vocals other than none (A20)", () => {
  for (const v of ["has-vocals", "unknown", undefined]) assert.match(refused(validPiece({ vocals: v as never })), /vocals "[^"]*", not none/);
});

test("refused: no mood tags, a tag outside the scorer's fixed set, a repeated tag", () => {
  assert.match(refused(validPiece({ moodTags: [] })), /no mood tags/);
  assert.match(refused(without("moodTags")), /no mood tags/);
  assert.match(refused(validPiece({ moodTags: ["dread", "spooky"] as never })), /outside the scorer's fixed set/);
  assert.match(refused(validPiece({ moodTags: ["dread", "dread"] })), /repeated/);
});

test("refused: an intensity other than low or high", () => {
  assert.match(refused(validPiece({ intensity: "medium" as never })), /intensity/);
});

test("refused: a bad id, title, artist, kind or source", () => {
  for (const id of ["Night Vigil", "", "-x", "a".repeat(81), "../x"]) assert.match(refused(validPiece({ id })), /lowercase slug/);
  assert.match(refused(validPiece({ title: "" })), /no title/);
  assert.match(refused(validPiece({ artist: " " })), /no artist/);
  assert.match(refused(validPiece({ kind: "song" as never })), /kind "song"/);
  assert.match(refused(validPiece({ source: "ftp://x.example/a" })), /no source URL/);
});

test("refused: file integrity fields missing or wrong (hash, size, format, type, key)", () => {
  const f = validPiece().file;
  assert.match(refused(without("file")), /no file record/);
  assert.match(refused(validPiece({ file: { ...f, sha256: "AB".repeat(32) } })), /not a SHA-256/);
  assert.match(refused(validPiece({ file: { ...f, sha256: "ab" } })), /not a SHA-256/);
  assert.match(refused(validPiece({ file: { ...f, bytes: 0 } })), /size/);
  assert.match(refused(validPiece({ file: { ...f, bytes: 1.5 } })), /size/);
  assert.match(refused(validPiece({ file: { ...f, format: "mp3" as never } })), /not aac or opus/);
  assert.match(refused(validPiece({ file: { ...f, contentType: "audio/mpeg" } })), /content type must be audio\/mp4/);
  assert.match(refused(validPiece({ file: { ...f, key: "pieces/night-vigil.m4a" } })), /content address/);
  assert.match(refused(validPiece({ file: { ...f, format: "opus", contentType: "audio/ogg" } })), /content address/);
});

test("refused: no duration, bad loop points, no addedAt", () => {
  assert.match(refused(validPiece({ duration: 0 })), /no duration/);
  assert.match(refused(validPiece({ duration: Number.NaN })), /no duration/);
  assert.match(refused(without("loop")), /no loop points/);
  assert.match(refused(validPiece({ loop: { start: 10, end: 10 } })), /0 <= start < end <= duration/);
  assert.match(refused(validPiece({ loop: { start: -1, end: 10 } })), /0 <= start < end <= duration/);
  assert.match(refused(validPiece({ loop: { start: 0, end: 121 } })), /0 <= start < end <= duration/);
  assert.match(refused(validPiece({ addedAt: "today" })), /no addedAt/);
});

test("a non-object is refused; every reason is reported at once", () => {
  assert.deepEqual(checkCatalogPiece(null), { ok: false, reasons: ["not a catalog entry"] });
  assert.deepEqual(checkCatalogPiece([validPiece()]), { ok: false, reasons: ["not a catalog entry"] });
  const res = checkCatalogPiece(validPiece({ vocals: "has-vocals" as never, moodTags: [], credit: null }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reasons.length, 3);
});

test("the content-addressed key: pieces/<sha256>.<ext>", () => {
  assert.equal(pieceKey("0".repeat(64), "aac"), `pieces/${"0".repeat(64)}.m4a`);
  assert.equal(pieceKey("0".repeat(64), "opus"), `pieces/${"0".repeat(64)}.opus`);
});

test("piece kinds agree with the scoring proxy's", () => {
  assert.deepEqual([...PIECE_KINDS], [...PROXY_PIECE_KINDS]);
});

test("readCatalog leaves out entries that fail A1, and repeats of an id or a file, and keeps the rest", () => {
  const good = validPiece();
  const other = validPiece({ id: "dawn", file: { ...good.file, sha256: "cd".repeat(32), key: pieceKey("cd".repeat(32), "aac") } });
  const read = readCatalog(catalogOf([good, validPiece({ id: "sung", vocals: "has-vocals" as never }), { id: "nc", license: "cc-by-nc" }, 7, validPiece(), validPiece({ id: "copy" }), other], 9));
  assert.deepEqual(read.catalog.pieces.map((p) => p.id), ["night-vigil", "dawn"]);
  assert.equal(read.catalog.version, 9);
  assert.deepEqual(read.ignored.map((i) => i.id), ["sung", "nc", null, "night-vigil", "copy"]);
  assert.match(read.ignored[3].reasons[0], /id is already taken/);
  assert.match(read.ignored[4].reasons[0], /same file/);
});

test("readCatalog refuses the whole file when its envelope is wrong", () => {
  assert.throws(() => readCatalog(null), /not an object/);
  assert.throws(() => readCatalog({ ...catalogOf([]), schema: 2 }), /schema 2; this reads schema 1/);
  assert.throws(() => readCatalog({ ...catalogOf([]), version: -1 }), /no version/);
  assert.throws(() => readCatalog({ ...catalogOf([]), updatedAt: 3 }), /no updatedAt/);
  assert.throws(() => readCatalog({ ...catalogOf([]), pieces: {} }), /no pieces list/);
});

test("checkCatalog, the writer's check, refuses a file with any bad entry", () => {
  assert.equal(checkCatalog(catalogOf([validPiece()])).ok, true);
  const res = checkCatalog(catalogOf([validPiece(), validPiece({ id: "x", vocals: "unknown" as never })]));
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reasons[0], /^x: /);
  assert.equal(checkCatalog({ schema: 9 }).ok, false);
});

test("an empty catalog is schema 1, version 0, no pieces", () => {
  assert.deepEqual(emptyCatalog("2026-10-24T00:00:00.000Z"), { schema: CATALOG_SCHEMA, version: 0, updatedAt: "2026-10-24T00:00:00.000Z", pieces: [] });
  assert.equal(checkCatalog(emptyCatalog("2026-10-24T00:00:00.000Z")).ok, true);
});
