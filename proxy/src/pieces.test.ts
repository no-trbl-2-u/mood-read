import assert from "node:assert/strict";
import { test } from "node:test";

import type { EmotionScore } from "./contract.ts";
import {
  candidateRequest,
  choosePieces,
  confirmedInstrumental,
  failsNoVocalsScreen,
  firstGuard,
  parseCandidates,
  toPiece,
  vocalsCheckRequest,
  type Candidate,
} from "./pieces.ts";

const emotions: EmotionScore[] = [
  { emotion: "dread", intensity: 0.9 },
  { emotion: "tension", intensity: 0.4 },
];
const c = (title: string, over: Partial<Candidate> = {}): Candidate => ({ title, artist: "Hans Zimmer", kind: "score", vocals: "none", moodTags: ["dread"], ...over });

test("the request asks for instrumental pieces only, by emotions alone (no events), with exclusions on a retry", () => {
  const r = candidateRequest({ title: "Dracula", author: "Bram Stoker", chapters: ["a", "b"] }, [{ index: 1, emotions, exclude: ["Old by Someone"] }]);
  assert.match(r.system, /fully instrumental: no singing, no choir, no humming, no spoken words/);
  assert.match(r.user, /^Chapter 2: dread 0\.9, tension 0\.4\. Do not suggest: Old by Someone\.$/m);
});

test("candidates parse per chapter (1-based in, 0-based out); malformed ones drop; an odd vocals value reads unsure", () => {
  const m = parseCandidates({
    chapters: [
      {
        chapter: 2,
        candidates: [
          { title: "Time", artist: "Hans Zimmer", kind: "score", vocals: "none", moodTags: ["tension", "rage", "tension"] },
          { title: "X", artist: "Y", kind: "song", vocals: "none", moodTags: [] },
          { title: "", artist: "Y", kind: "score", vocals: "none", moodTags: [] },
          { title: "Z", artist: "W", kind: "ambient", vocals: "maybe", moodTags: ["calm"] },
        ],
      },
      { chapter: "x", candidates: [] },
    ],
  });
  assert.deepEqual([...m.keys()], [1]);
  assert.deepEqual(m.get(1), [
    { title: "Time", artist: "Hans Zimmer", kind: "score", vocals: "none", moodTags: ["tension"] },
    { title: "Z", artist: "W", kind: "ambient", vocals: "unsure", moodTags: ["calm"] },
  ]);
});

test("the no-vocals screen drops names that mark a song, a voice or a choir (A20)", () => {
  const vocal: [string, string][] = [
    ["Lux Aeterna (feat. Choir)", "Clint Mansell"],
    ["Song of the Sea", "Bruno Coulais"],
    ["O Fortuna", "Carl Orff Choir"],
    ["Requiem for a Dream", "Clint Mansell"],
    ["Vocalise", "Rachmaninoff"],
    ["Ave Maria (Aria)", "Schubert"],
    ["The Spoken Word", "Anyone"],
  ];
  for (const [title, artist] of vocal) assert.equal(failsNoVocalsScreen({ title, artist }), true, title);
  const clean: [string, string][] = [
    ["Time", "Hans Zimmer"],
    ["An Ending (Ascent)", "Brian Eno"],
    ["Comptine d'un autre ete", "Yann Tiersen"],
  ];
  for (const [title, artist] of clean) assert.equal(failsNoVocalsScreen({ title, artist }), false, title);
});

test("the first guard drops self-flagged vocals and unsure, screen failures, off-mood tags and repeats", () => {
  const rejected = new Set<string>();
  const out = firstGuard(
    [
      c("Kept One"),
      c("Has Voice", { vocals: "some" }),
      c("Not Sure", { vocals: "unsure" }),
      c("A Song"),
      c("Wrong Mood", { moodTags: ["joy"] }),
      c("Kept One"),
      c("Kept Two", { moodTags: ["tension", "joy"] }),
    ],
    emotions,
    rejected,
  );
  assert.deepEqual(out.map((x) => x.title), ["Kept One", "Kept Two"]);
  assert.equal(rejected.size, 4);
  assert.deepEqual(firstGuard([c("Has Voice")], emotions, rejected), [], "a rejected piece stays rejected on a retry");
});

test("the second check confirms only what it calls instrumental; unsure or missing is a no", () => {
  const r = vocalsCheckRequest([{ id: "p1", title: "Time", artist: "Hans Zimmer" }]);
  assert.match(r.user, /^p1: "Time" by Hans Zimmer$/m);
  const ok = confirmedInstrumental({
    verdicts: [
      { id: "p1", verdict: "instrumental" },
      { id: "p2", verdict: "unsure" },
      { id: "p3", verdict: "has-vocals" },
    ],
  });
  assert.deepEqual([...ok], ["p1"]);
  assert.deepEqual([...confirmedInstrumental(null)], []);
});

test("choosing: the best fit is the piece, the rest are alternates (two to four); fewer than three names nothing", () => {
  const passed = [c("Tension Only", { moodTags: ["tension"] }), c("Both", { moodTags: ["dread", "tension"] }), c("Dread Only"), c("Four"), c("Five"), c("Six")];
  const chosen = choosePieces(passed, emotions)!;
  assert.equal(chosen.piece.title, "Both");
  assert.deepEqual(chosen.alternates.map((p) => p.title), ["Dread Only", "Four", "Five", "Six"]);
  assert.ok([chosen.piece, ...chosen.alternates].every((p) => p.vocals === "none"));
  assert.equal(choosePieces(passed.slice(0, 2), emotions), null);
  assert.equal(choosePieces(passed.slice(0, 3), emotions)!.alternates.length, 2);
});

test("a piece carries its title, artist, kind, mood tags and vocals none, with a stable id", () => {
  assert.deepEqual(toPiece(c("Dream is Collapsing", { kind: "score" })), {
    id: "hans-zimmer--dream-is-collapsing",
    title: "Dream is Collapsing",
    artist: "Hans Zimmer",
    kind: "score",
    vocals: "none",
    moodTags: ["dread"],
  });
});
