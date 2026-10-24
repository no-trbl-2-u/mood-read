import assert from "node:assert/strict";
import { test } from "node:test";

import { bookKey, cleanScenes, emotionSetKey, isJobId, LIMITS, parseBookRequest, parseVerdictBatch, VERDICT_LIMITS } from "./validate.ts";

const book = { title: "The Hobbit", author: "J. R. R. Tolkien", chapters: ["An Unexpected Party", "Roast Mutton"] };

test("a body of exactly title, author and chapter titles is accepted, trimmed and whitespace-collapsed", () => {
  const r = parseBookRequest({ title: "  The  Hobbit ", author: "J. R. R. Tolkien", chapters: [" An Unexpected   Party", "Roast Mutton"] });
  assert.deepEqual(r, { ok: true, book });
});

test("an empty author is allowed (untagged files), an empty title is not", () => {
  assert.equal(parseBookRequest({ ...book, author: "" }).ok, true);
  assert.equal(parseBookRequest({ ...book, title: "  " }).ok, false);
});

test("any field besides title, author, chapters and the two catalog numbers is refused, never ignored (A22)", () => {
  for (const extra of [{ deviceId: "abc" }, { position: 120 }, { audio: "UklGRg==" }, { rescore: true }, { email: "x@y.z" }, { gutenbergText: "It was" }, { archiveId: "alice_librivox" }]) {
    const r = parseBookRequest({ ...book, ...extra });
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /only title, author, chapters, librivoxId and gutenbergId/);
  }
});

test("a book's public LibriVox and Gutenberg numbers are accepted, each optional (05.9, A10)", () => {
  assert.deepEqual(parseBookRequest({ ...book, librivoxId: "253", gutenbergId: "1342" }), { ok: true, book: { ...book, librivoxId: "253", gutenbergId: "1342" } });
  assert.deepEqual(parseBookRequest({ ...book, gutenbergId: "11" }), { ok: true, book: { ...book, gutenbergId: "11" } });
  assert.deepEqual(parseBookRequest({ ...book, librivoxId: "200" }), { ok: true, book: { ...book, librivoxId: "200" } });
  assert.equal(parseBookRequest({ ...book, gutenbergId: "9".repeat(LIMITS.catalogIdDigits) }).ok, true);
  const plain = parseBookRequest(book);
  assert.ok(plain.ok && !("gutenbergId" in plain.book) && !("librivoxId" in plain.book), "an imported book carries no catalog numbers");
});

test("a catalog number is digits only, bounded: anything else is refused, never cleaned up", () => {
  const bad = [1342, "", " 1342", "1342 ", "0", "01342", "-5", "+5", "1e3", "13.42", "0x1f", "١٣٤٢", "pg1342", "1342/../x", "9".repeat(LIMITS.catalogIdDigits + 1), null, ["1342"], { id: "1" }];
  for (const v of bad) {
    for (const field of ["librivoxId", "gutenbergId"]) {
      const r = parseBookRequest({ ...book, [field]: v });
      assert.equal(r.ok, false, `${field}=${JSON.stringify(v)}`);
      assert.match((r as { error: string }).error, new RegExp(field));
    }
  }
});

test("wrong shapes are refused", () => {
  for (const body of [null, [], "x", 3, { ...book, chapters: [] }, { ...book, chapters: "one" }, { ...book, chapters: [1] }, { ...book, chapters: ["  "] }, { title: "x", chapters: ["a"] }, { ...book, author: 5 }]) {
    assert.equal(parseBookRequest(body).ok, false, JSON.stringify(body));
  }
});

test("lengths are capped", () => {
  assert.equal(parseBookRequest({ ...book, title: "x".repeat(LIMITS.title + 1) }).ok, false);
  assert.equal(parseBookRequest({ ...book, chapters: Array.from({ length: LIMITS.chapters + 1 }, (_, i) => `c${i}`) }).ok, false);
  assert.equal(parseBookRequest({ ...book, chapters: ["y".repeat(LIMITS.chapterTitle + 1)] }).ok, false);
});

test("the book key is a stable hash of the book, the same for any listener, ignoring case and spacing", async () => {
  const a = await bookKey(book);
  const b = await bookKey({ title: "the hobbit", author: "j. r. r.  tolkien", chapters: ["AN UNEXPECTED PARTY", "Roast  Mutton"] });
  assert.equal(a, b);
  assert.ok(isJobId(a));
  assert.notEqual(a, await bookKey({ ...book, chapters: ["Roast Mutton", "An Unexpected Party"] }));
  assert.notEqual(a, await bookKey({ ...book, author: "Someone Else" }));
});

test("the Gutenberg number joins the cache key: a text-scored book never collides with a web-scored one (05.9)", async () => {
  const plain = await bookKey(book);
  const text = await bookKey({ ...book, gutenbergId: "1342" });
  assert.ok(isJobId(text));
  assert.notEqual(text, plain, "the same title scored from its text keys apart from the web-scored one");
  assert.notEqual(text, await bookKey({ ...book, gutenbergId: "1343" }));
  assert.equal(text, await bookKey({ ...book, gutenbergId: "1342", librivoxId: "253" }), "the LibriVox number does not split the key");
  assert.equal(plain, await bookKey({ ...book, librivoxId: "253" }));
  // A book without a Gutenberg number keys exactly as before 05.9, so cached results keep their keys.
  const before = JSON.stringify(["the hobbit", "j. r. r. tolkien", ["an unexpected party", "roast mutton"]]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(before));
  assert.equal(plain, [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""));
});

test("job ids are 64 hex characters, nothing else", () => {
  assert.equal(isJobId("a".repeat(64)), true);
  assert.equal(isJobId("A".repeat(64)), false);
  assert.equal(isJobId("../etc"), false);
});

// ---- scenes (07.1, A1) ----

const chapter = [
  { emotion: "dread" as const, intensity: 0.8 },
  { emotion: "calm" as const, intensity: 0.3 },
];
const sc = (span: unknown, emotion = "dread", extra: Record<string, unknown> = {}) => ({ emotions: [{ emotion, intensity: 0.6 }], span, ...extra });
const spans = (s: { span: number }[]) => s.map((x) => x.span);
const sum = (s: { span: number }[]) => s.reduce((t, x) => t + x.span, 0);

test("no sequence in the sources: one scene, the whole chapter with the chapter's own emotions", () => {
  for (const raw of [undefined, null, [], "x", [sc(1)], [sc(0.7, "joy")], [sc(-1), sc(Number.NaN)]]) {
    assert.deepEqual(cleanScenes(raw, chapter), [{ emotions: chapter, span: 1 }], JSON.stringify(raw));
  }
});

test("an unscored chapter (no emotions) has no scenes", () => {
  assert.deepEqual(cleanScenes([sc(0.5), sc(0.5)], []), []);
});

test("an ordered sequence keeps its order and its spans, rounded to 0.05 and summing to exactly 1", () => {
  const s = cleanScenes([sc(0.4, "calm"), sc(0.35, "tension"), sc(0.25, "dread")], chapter);
  assert.deepEqual(s.map((x) => x.emotions[0].emotion), ["calm", "tension", "dread"]);
  assert.deepEqual(spans(s), [0.4, 0.35, 0.25]);
  const odd = cleanScenes([sc(0.33, "calm"), sc(0.33, "tension"), sc(0.34, "dread")], chapter);
  for (const x of odd) assert.ok(Math.abs(x.span * 20 - Math.round(x.span * 20)) < 1e-9, `${x.span} is a multiple of 0.05`);
  assert.ok(Math.abs(sum(odd) - 1) < 1e-9);
});

test("spans that do not sum to 1 are normalised", () => {
  const s = cleanScenes([sc(2, "calm"), sc(2, "dread")], chapter);
  assert.deepEqual(spans(s), [0.5, 0.5]);
});

test("a span under 0.1 is merged into its smaller neighbour; the neighbour keeps its own emotions", () => {
  const s = cleanScenes([sc(0.5, "calm"), sc(0.05, "joy"), sc(0.45, "dread")], chapter);
  assert.deepEqual(s.map((x) => x.emotions[0].emotion), ["calm", "dread"]);
  assert.deepEqual(spans(s), [0.5, 0.5]);
  const first = cleanScenes([sc(0.04, "joy"), sc(0.56, "calm"), sc(0.4, "dread")], chapter);
  assert.deepEqual(first.map((x) => x.emotions[0].emotion), ["calm", "dread"]);
  assert.deepEqual(spans(first), [0.6, 0.4]);
  // Everything merges into one: the chapter itself.
  assert.deepEqual(cleanScenes([sc(0.95, "joy"), sc(0.05, "calm")], chapter), [{ emotions: chapter, span: 1 }]);
});

test("four scenes at most: the smallest merge until four are left, each at least 0.1", () => {
  const raw = [sc(0.2, "calm"), sc(0.15, "joy"), sc(0.2, "tension"), sc(0.15, "sorrow"), sc(0.3, "dread")];
  const s = cleanScenes(raw, chapter);
  assert.equal(s.length, 4);
  assert.ok(s.every((x) => x.span >= 0.1));
  assert.ok(Math.abs(sum(s) - 1) < 1e-9);
  const many = cleanScenes(Array.from({ length: 12 }, (_, i) => sc(1, i % 2 ? "calm" : "dread")), chapter);
  assert.ok(many.length <= 4 && many.every((x) => x.span >= 0.1) && Math.abs(sum(many) - 1) < 1e-9);
});

test("a scene carries no text: any other field is stripped; emotions come from the fixed set only", () => {
  const s = cleanScenes([sc(0.5, "calm", { title: "The duel", summary: "Harker escapes" }), { ...sc(0.5), emotions: [{ emotion: "rage", intensity: 1 }, { emotion: "dread", intensity: 0.9 }], text: "x" }], chapter);
  for (const x of s) assert.deepEqual(Object.keys(x).sort(), ["emotions", "span"]);
  assert.deepEqual(s[1].emotions, [{ emotion: "dread", intensity: 0.9 }]);
});

test("a scene with no emotions in the set gives its span to its neighbour", () => {
  const s = cleanScenes([sc(0.3, "calm"), { emotions: [{ emotion: "rage", intensity: 1 }], span: 0.3 }, sc(0.4, "dread")], chapter);
  assert.deepEqual(s.map((x) => x.emotions[0].emotion), ["calm", "dread"]);
  assert.deepEqual(spans(s), [0.6, 0.4]);
});

// ---- POST /v1/verdicts (07.5, A6) ----

const row = { pieceId: "composer-1--theme-1", emotions: ["dread", "tension"], verdict: "fits" };

test("a verdict batch of exactly rows of pieceId, emotions and verdict is accepted, emotions in the fixed set's order", () => {
  assert.deepEqual(parseVerdictBatch({ rows: [row, { ...row, verdict: "misfit" }] }), {
    ok: true,
    batch: {
      rows: [
        { ...row, emotions: ["tension", "dread"] },
        { ...row, emotions: ["tension", "dread"], verdict: "misfit" },
      ],
    },
  });
  assert.equal(emotionSetKey(["dread", "tension"]), "tension,dread");
});

test("any other field, on the body or on a row, is refused (A6, A22): no book, chapter, device or time rides along", () => {
  for (const extra of [{ bookId: "b" }, { deviceId: "d" }, { day: "2026-10-24" }]) {
    const r = parseVerdictBatch({ rows: [row], ...extra });
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /only rows is accepted/);
  }
  for (const extra of [{ chapterIndex: 0 }, { at: 1 }, { bookId: "b" }, { position: 3 }]) {
    const r = parseVerdictBatch({ rows: [{ ...row, ...extra }] });
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /only pieceId, emotions and verdict/);
  }
});

test("malformed rows, an empty batch and more than 200 rows are refused", () => {
  assert.equal(VERDICT_LIMITS.rows, 200);
  const bad: unknown[] = [
    null,
    [],
    { rows: [] },
    { rows: "x" },
    { rows: [null] },
    { rows: [{ ...row, pieceId: "" }] },
    { rows: [{ ...row, pieceId: 7 }] },
    { rows: [{ ...row, pieceId: "x".repeat(201) }] },
    { rows: [{ ...row, pieceId: "a\nb" }] },
    { rows: [{ ...row, emotions: [] }] },
    { rows: [{ ...row, emotions: ["anger"] }] },
    { rows: [{ ...row, emotions: ["dread", "dread"] }] },
    { rows: [{ ...row, emotions: [{ emotion: "dread", intensity: 1 }] }] },
    { rows: [{ ...row, verdict: "meh" }] },
    { rows: Array.from({ length: 201 }, () => row) },
  ];
  for (const b of bad) assert.equal(parseVerdictBatch(b).ok, false, JSON.stringify(b)?.slice(0, 80));
  assert.equal(parseVerdictBatch({ rows: Array.from({ length: 200 }, () => row) }).ok, true);
});
