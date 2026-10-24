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
