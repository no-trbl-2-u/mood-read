import assert from "node:assert/strict";
import { test } from "node:test";

import { createScoringApi, readJobView, scoringRequest } from "./scoring-api.ts";
import type { Book, JobView } from "./types.ts";

const book = {
  title: "Dracula",
  author: "Bram Stoker",
  chapters: [{ bookId: "b", index: 0, title: "Chapter 1", fileIndex: 0, start: 0, end: 10 }],
} satisfies Pick<Book, "title" | "author" | "chapters">;

const ID = "a".repeat(64);
const running: JobView = { jobId: ID, state: "running", progress: { step: 1, steps: 4, chaptersDone: 0, chapters: 1 } };

test("the request is exactly the title, author and chapter titles", () => {
  assert.deepEqual(scoringRequest({ ...book, id: "x", narrator: "N", files: [], cover: "c" } as unknown as Book), {
    title: "Dracula",
    author: "Bram Stoker",
    chapters: ["Chapter 1"],
  });
});

test("A10: a LibriVox book with a Gutenberg number sends both public catalog numbers, and nothing else new", () => {
  const librivox = { ...book, source: { kind: "librivox", librivoxId: "alice_in_wonderland_librivox", catalogId: "200", gutenbergId: "11" } } satisfies Pick<Book, "title" | "author" | "chapters" | "source">;
  const req = scoringRequest({ ...librivox, id: "x", narrator: "N", files: [{ ref: "blob:audio", name: "a.mp3", duration: 10 }], cover: "c" } as unknown as Book);
  assert.deepEqual(req, { title: "Dracula", author: "Bram Stoker", chapters: ["Chapter 1"], librivoxId: "200", gutenbergId: "11" });
  // The archive.org identifier, files and audio never ride along.
  assert.doesNotMatch(JSON.stringify(req), /alice_in_wonderland_librivox|blob:|a\.mp3/);
});

test("an imported book, or a LibriVox book whose text has no Gutenberg number, sends title, author and chapters only", () => {
  const plain = { title: "Dracula", author: "Bram Stoker", chapters: ["Chapter 1"] };
  assert.deepEqual(scoringRequest({ ...book, source: { kind: "import" } }), plain);
  assert.deepEqual(scoringRequest({ ...book, source: { kind: "librivox", librivoxId: "dracula_librivox", catalogId: "123" } }), plain);
  assert.deepEqual(scoringRequest({ ...book, source: { kind: "librivox", librivoxId: "dracula_librivox" } }), plain);
});

test("start posts the catalog numbers in its body for a LibriVox book", async () => {
  const bodies: unknown[] = [];
  const api = createScoringApi("https://proxy.example", async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json(running);
  });
  await api.start({ ...book, source: { kind: "librivox", librivoxId: "a", catalogId: "200", gutenbergId: "11" } });
  await api.start({ ...book, source: { kind: "import" } });
  assert.deepEqual(bodies, [
    { title: "Dracula", author: "Bram Stoker", chapters: ["Chapter 1"], librivoxId: "200", gutenbergId: "11" },
    { title: "Dracula", author: "Bram Stoker", chapters: ["Chapter 1"] },
  ]);
});

test("start posts to /v1/score (or /v1/rescore) at the base URL; status reads /v1/jobs/:id; 404 is null", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createScoringApi("https://proxy.example/", async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith(`/v1/jobs/${"b".repeat(64)}`)) return new Response("no", { status: 404 });
    return Response.json(running);
  });
  assert.deepEqual(await api.start(book), running);
  await api.start(book, true);
  assert.deepEqual(await api.status(ID), running);
  assert.equal(await api.status("b".repeat(64)), null);
  assert.deepEqual(
    calls.map((c) => [c.init?.method ?? "GET", c.url]),
    [
      ["POST", "https://proxy.example/v1/score"],
      ["POST", "https://proxy.example/v1/rescore"],
      ["GET", `https://proxy.example/v1/jobs/${ID}`],
      ["GET", `https://proxy.example/v1/jobs/${"b".repeat(64)}`],
    ],
  );
  assert.equal(new Headers(calls[0].init?.headers).get("authorization"), null, "no key, no auth header (A22)");
});

test("an error status throws", async () => {
  const api = createScoringApi("https://proxy.example", async () => new Response("x", { status: 503 }));
  await assert.rejects(api.start(book), /503/);
});

test("answers are checked: a bad id, an unknown state, a done job without chapters, a vocal piece or an odd emotion is refused", () => {
  const piece = { id: "p", title: "T", artist: "A", kind: "score", vocals: "none", moodTags: ["calm"] };
  const mood = { chapterIndex: 0, chapterTitle: "Chapter 1", emotions: [{ emotion: "calm", intensity: 0.5 }], sources: [], coverage: "scored", model: "m", version: "v", scoredAt: 1 };
  const done = (chapters: unknown) => ({ ...running, state: "done", result: { key: ID, chapters, model: "m", version: "v", scoredAt: 1, costUsd: 0.1 } });
  assert.throws(() => readJobView({ ...running, jobId: "nope" }));
  assert.throws(() => readJobView({ ...running, state: "exploded" }));
  assert.throws(() => readJobView({ ...running, state: "done" }));
  assert.throws(() => readJobView(done([{ index: 0, title: "Chapter 1", mood, pieces: { piece: { ...piece, vocals: "some" }, alternates: [] } }])), /vocals/);
  assert.throws(() => readJobView(done([{ index: 0, title: "Chapter 1", mood: { ...mood, emotions: [{ emotion: "rage", intensity: 1 }] }, pieces: null }])), /emotion/);
  const ok = readJobView(done([{ index: 0, title: "Chapter 1", mood, pieces: { piece, alternates: [piece, piece] } }]));
  assert.equal(ok.result?.chapters.length, 1);
  assert.deepEqual(readJobView({ ...running, progress: { step: -1, steps: "x" } }).progress, { step: 0, steps: 0, chaptersDone: 0, chapters: 0 });
});

test("a running, capped or failed answer may carry the cached result; it is checked like a finished one", () => {
  const piece = { id: "p", title: "T", artist: "A", kind: "score", vocals: "none", moodTags: ["calm"] };
  const mood = { chapterIndex: 0, chapterTitle: "Chapter 1", emotions: [{ emotion: "calm", intensity: 0.5 }], sources: [], coverage: "scored", model: "m", version: "v", scoredAt: 1 };
  const withResult = (state: string, p: unknown) => ({ ...running, state, result: { key: ID, chapters: [{ index: 0, title: "Chapter 1", mood, pieces: p }], model: "m", version: "v", scoredAt: 1, costUsd: 0.1 } });
  for (const state of ["running", "capped", "failed"]) {
    const v = readJobView(withResult(state, { piece, alternates: [piece, piece] }));
    assert.equal(v.state, state);
    assert.equal(v.result?.chapters.length, 1, state);
    assert.throws(() => readJobView(withResult(state, { piece: { ...piece, vocals: "some" }, alternates: [] })), /vocals/);
  }
});

// ---- scenes (07.1) ----

const scenePiece = (id: string) => ({ id, title: `T ${id}`, artist: "A", kind: "score", vocals: "none", moodTags: ["calm"] });
const sceneMood = (scenes: unknown) => ({ chapterIndex: 0, chapterTitle: "Chapter 1", emotions: [{ emotion: "calm", intensity: 0.5 }], scenes, sources: [], coverage: "scored", model: "m", version: "v", scoredAt: 1 });
const doneWith = (mood: unknown, pieces: unknown) =>
  readJobView({ ...running, state: "done", result: { key: ID, chapters: [{ index: 0, title: "Chapter 1", mood, pieces }], model: "m", version: "v", scoredAt: 1, costUsd: 0.1 } });
const twoScenes = [
  { emotions: [{ emotion: "calm", intensity: 0.5 }], span: 0.4 },
  { emotions: [{ emotion: "dread", intensity: 0.9 }], span: 0.6 },
];

test("a chapter's scenes and scene pieces are kept, emotions and spans only", () => {
  const v = doneWith(sceneMood([{ ...twoScenes[0], summary: "a text that must not ride" }, twoScenes[1]]), { piece: scenePiece("p"), alternates: [scenePiece("q"), scenePiece("r")], scenePieces: [scenePiece("s"), scenePiece("p")] });
  const c = v.result!.chapters[0];
  assert.deepEqual(c.mood.scenes, twoScenes);
  assert.deepEqual(c.pieces?.scenePieces?.map((p) => p.id), ["s", "p"]);
});

test("a book cached before 07.1, with no scenes, still reads", () => {
  const mood = sceneMood(undefined);
  delete (mood as { scenes?: unknown }).scenes;
  const v = doneWith(mood, { piece: scenePiece("p"), alternates: [scenePiece("q"), scenePiece("r")] });
  assert.equal(v.result!.chapters[0].mood.scenes, undefined);
  assert.equal(v.result!.chapters[0].pieces?.scenePieces, undefined);
});

test("scenes that break the contract are dropped (the chapter reads as one scene); a scene piece with vocals is refused", () => {
  const bad = [
    "x",
    [],
    [...twoScenes, ...twoScenes, twoScenes[0]],
    [{ ...twoScenes[0], span: 0.3 }, twoScenes[1]],
    [{ ...twoScenes[0], span: "half" }, twoScenes[1]],
    [{ emotions: "calm", span: 0.4 }, twoScenes[1]],
  ];
  for (const scenes of bad) assert.equal(doneWith(sceneMood(scenes), null).result!.chapters[0].mood.scenes, undefined, JSON.stringify(scenes));
  assert.throws(() => doneWith(sceneMood([{ emotions: [{ emotion: "rage", intensity: 1 }], span: 0.4 }, twoScenes[1]]), null), /emotion/);
  assert.throws(() => doneWith(sceneMood(twoScenes), { piece: scenePiece("p"), alternates: [], scenePieces: [{ ...scenePiece("s"), vocals: "some" }, scenePiece("p")] }), /vocals/);
  const mismatched = doneWith(sceneMood(twoScenes), { piece: scenePiece("p"), alternates: [], scenePieces: [scenePiece("s")] });
  assert.equal(mismatched.result!.chapters[0].pieces?.scenePieces, undefined, "scene pieces must match the scenes one for one");
});

test("a proxy answer never carries a listener's seed: coverage \"listener\" (07.6) is refused", () => {
  assert.throws(() => doneWith({ ...sceneMood(twoScenes), coverage: "listener" } as never, null), /coverage/);
  assert.throws(() => doneWith({ ...sceneMood(twoScenes), coverage: undefined } as never, null), /coverage/);
});

test("sendVerdicts posts exactly { rows } of pieceId, emotions and verdict to /v1/verdicts, with only a content type (07.5)", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createScoringApi("https://proxy.example/", async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 204 });
  });
  const extra = { pieceId: "a--b", emotions: ["dread" as const], verdict: "fits" as const, chapterIndex: 3, at: 9 };
  await api.sendVerdicts([extra]);
  assert.equal(calls[0].url, "https://proxy.example/v1/verdicts");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(calls[0].init?.headers, { "content-type": "application/json" });
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { rows: [{ pieceId: "a--b", emotions: ["dread"], verdict: "fits" }] });
  const failing = createScoringApi("https://proxy.example", async () => new Response("x", { status: 429 }));
  await assert.rejects(failing.sendVerdicts([extra]), /429/);
});
