import assert from "node:assert/strict";
import { test } from "node:test";

import { scenePiecesOf, scenesOf } from "./scenes.ts";
import type { ChapterMood, ChapterPlaylist } from "./types.ts";

const mood = (over: Partial<ChapterMood> = {}): ChapterMood => ({
  chapterIndex: 0,
  chapterTitle: "One",
  emotions: [{ emotion: "dread", intensity: 0.8 }],
  sources: [],
  coverage: "scored",
  model: "m",
  version: "01.2.1",
  scoredAt: 1,
  ...over,
});

const playlist = (over: Partial<ChapterPlaylist> = {}): ChapterPlaylist => ({ chapterIndex: 0, piece: "p", alternates: ["a1", "a2"], pick: "auto", ...over });

test("a chapter cached before 07.1 (no scenes) reads as one scene equal to the chapter", () => {
  assert.deepEqual(scenesOf(mood()), [{ emotions: [{ emotion: "dread", intensity: 0.8 }], span: 1 }]);
});

test("a chapter's own scenes are read as they are, in order", () => {
  const scenes = [
    { emotions: [{ emotion: "calm" as const, intensity: 0.4 }], span: 0.4 },
    { emotions: [{ emotion: "dread" as const, intensity: 0.9 }], span: 0.6 },
  ];
  assert.deepEqual(scenesOf(mood({ scenes })), scenes);
});

test("an unscored chapter has no scenes; an empty scene list reads as one scene", () => {
  assert.deepEqual(scenesOf(mood({ coverage: "too-little", emotions: [] })), []);
  assert.equal(scenesOf(mood({ scenes: [] })).length, 1);
});

test("scene pieces: the playlist's own, else the chapter's piece for every scene", () => {
  assert.deepEqual(scenePiecesOf(playlist({ scenePieces: ["s1", "s2"] }), 2), ["s1", "s2"]);
  assert.deepEqual(scenePiecesOf(playlist(), 3), ["p", "p", "p"], "a playlist cached before 07.1");
  assert.deepEqual(scenePiecesOf(playlist({ scenePieces: ["s1"] }), 2), ["p", "p"], "a length that does not match the scenes is not trusted");
  assert.deepEqual(scenePiecesOf(null, 2), []);
});

test("a pick covers the chapter: every scene plays the picked alternate (D18)", () => {
  assert.deepEqual(scenePiecesOf(playlist({ scenePieces: ["s1", "s2"], pick: "a2" }), 2), ["a2", "a2"]);
});
