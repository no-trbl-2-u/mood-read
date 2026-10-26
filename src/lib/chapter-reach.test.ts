import assert from "node:assert/strict";
import { test } from "node:test";

import { recordPlayback, type PlaybackSeen } from "./chapter-reach.ts";
import { type Kv } from "./library-store.ts";
import { createReachedStore } from "./reached.ts";
import { createSoundtrackStore } from "./soundtrack-store.ts";
import type { ChapterScore, Piece } from "./types.ts";

function mapKv(map = new Map<string, string>()): Kv {
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const piece = (n: number): Piece => ({ id: `p${n}`, title: `Theme ${n}`, artist: `C${n}`, kind: "score", vocals: "none", moodTags: ["tension"] });

function scoreOf(index: number, title: string, pieceId: string): ChapterScore {
  return {
    mood: {
      chapterIndex: index,
      chapterTitle: title,
      emotions: [{ emotion: "tension", intensity: 0.8 }],
      sources: [],
      coverage: "scored",
      model: "m",
      version: "v",
      scoredAt: 1,
    },
    pieces: [piece(1), piece(2)],
    playlist: { chapterIndex: index, piece: pieceId, alternates: [], pick: "auto" },
  };
}

const one = { index: 0, title: "One", start: 0, end: 100 };
const two = { index: 1, title: "Two", start: 100, end: 200 };
const scores = [scoreOf(0, "One", "p1"), scoreOf(1, "Two", "p2")];

function rig() {
  const reached = createReachedStore(mapKv());
  const soundtrack = createSoundtrackStore(mapKv());
  const deps = {
    reach: reached.reach,
    reachAt: reached.reachAt,
    furthestIn: reached.furthestIn,
    log: soundtrack.log,
  };
  return { reached, soundtrack, deps };
}

const seen = (over: Partial<PlaybackSeen>): PlaybackSeen => ({ bookId: "b", chapter: one, position: 5, scores, ...over });

test("4.2: playback entering the next chapter reaches it and logs its piece, with no screen involved", () => {
  const { reached, soundtrack, deps } = rig();
  recordPlayback(seen({}), deps);
  assert.equal(reached.furthest("b"), 0);
  assert.deepEqual(soundtrack.entries().map((e) => e.pieceId), ["p1"]);
  // The clock rolls over into chapter two: it is reached, and its piece logs after the first.
  recordPlayback(seen({ chapter: two, position: 100.2 }), deps);
  assert.equal(reached.furthest("b"), 100);
  assert.equal(reached.furthestIn("b", two), 100.2);
  assert.deepEqual(soundtrack.entries().map((e) => e.pieceId), ["p1", "p2"]);
});

test("4.2: seeing the same moment again changes nothing and tells no listener (no double logging)", () => {
  const { reached, soundtrack, deps } = rig();
  recordPlayback(seen({}), deps);
  let calls = 0;
  reached.subscribe(() => calls++);
  soundtrack.subscribe(() => calls++);
  const before = soundtrack.entries();
  recordPlayback(seen({}), deps);
  recordPlayback(seen({ position: 5.4 }), deps);
  assert.equal(calls, 0);
  assert.equal(soundtrack.entries(), before);
});

test("4.2: nothing open, no chapter or an unscored chapter reaches nothing it should not", () => {
  const { reached, soundtrack, deps } = rig();
  recordPlayback(seen({ bookId: null }), deps);
  recordPlayback(seen({ chapter: undefined }), deps);
  assert.equal(reached.furthest("b"), null);
  // An unscored chapter is still reached, but there is no piece to log.
  recordPlayback(seen({ scores: [] }), deps);
  assert.equal(reached.furthest("b"), 0);
  assert.deepEqual(soundtrack.entries(), []);
  // A score under another title for the same index is not this chapter's.
  recordPlayback(seen({ scores: [scoreOf(0, "Renamed", "p1")] }), deps);
  assert.deepEqual(soundtrack.entries(), []);
});

test("4.2: a score arriving later logs the piece of the chapter already playing", () => {
  const { soundtrack, deps } = rig();
  recordPlayback(seen({ scores: [] }), deps);
  recordPlayback(seen({}), deps);
  assert.deepEqual(soundtrack.entries().map((e) => e.pieceId), ["p1"]);
});

test("4.2: a position outside the playing chapter does not move its place", () => {
  const { reached, deps } = rig();
  recordPlayback(seen({ position: null }), deps);
  assert.equal(reached.furthestIn("b", one), null);
  assert.equal(reached.furthest("b"), 0);
});

