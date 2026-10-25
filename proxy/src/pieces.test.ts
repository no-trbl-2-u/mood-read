import assert from "node:assert/strict";
import { test } from "node:test";

import type { EmotionScore, JobView, Piece } from "./contract.ts";
import {
  CANDIDATES_PER_CHAPTER,
  candidateRequest,
  chooseReference,
  alternateIds,
  confirmedInstrumental,
  DEMOTE_MIN_VERDICTS,
  demoted,
  orderAlternates,
  orderJobView,
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

test("the reference is the best fit among what passed, ties in the model's order; none passed, none named (D13)", () => {
  const passed = [c("Tension Only", { moodTags: ["tension"] }), c("Both", { moodTags: ["dread", "tension"] }), c("Dread Only")];
  assert.equal(chooseReference(passed, emotions)!.title, "Both");
  assert.equal(chooseReference([c("First"), c("Second")], emotions)!.title, "First");
  assert.equal(chooseReference([c("Calm Only", { moodTags: ["calm"] })], emotions), null, "a piece that fits none of the chapter's emotions is no reference");
  assert.equal(chooseReference([], emotions), null);
});

test("the model is asked for three candidates a chapter, enough for one reference after the checks (05.3)", () => {
  assert.equal(CANDIDATES_PER_CHAPTER, 3);
  const r = candidateRequest({ title: "Dracula", author: "Bram Stoker", chapters: ["a"] }, [{ index: 0, emotions, exclude: [] }]);
  assert.match(r.system, /suggest 3 real, well-known pieces/);
  assert.doesNotMatch(r.system, /scene/i);
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

test("the no-vocals name screen catches plural and common vocal titles, and leaves instrumental forms alone (A20)", () => {
  const vocal = [
    "Ballads of the Sea",
    "Lullabies",
    "Hallelujah",
    "Songbird",
    "Choirboy",
    "Vocalises",
    "Masses",
    "Requiems",
    "Psalm 23",
    "Ave Maria",
    "Carmina Burana",
    "Arias",
    "Stabat Mater",
    "Agnus Dei",
    "Cantatas",
    "Duets",
  ];
  for (const title of vocal) assert.equal(failsNoVocalsScreen({ title, artist: "X" }), true, title);
  const clean = ["Ballade No. 1 in G minor", "Massive", "Nocturne", "Passacaglia"];
  for (const title of clean) assert.equal(failsNoVocalsScreen({ title, artist: "Frederic Chopin" }), false, title);
});

test("the name screen catches humming and the vocal works best known by name (A20)", () => {
  const vocal = [
    "Lacrimosa",
    "O Fortuna",
    "Nessun Dorma",
    "Gloria in D major",
    "Sanctus",
    "Dies Irae",
    "Ode to Joy",
    "Humming",
    "Hummed Lullaby Theme",
    "Hum",
    "Libera Me",
    "Pie Jesu",
    "Panis Angelicus",
    "Benedictus",
    "Ave Verum Corpus",
    "Casta Diva",
    "Lascia ch'io pianga",
    "Una furtiva lagrima",
    "Queen of the Night",
    "Requiem aeternam",
    "Vocalise",
  ];
  for (const title of vocal) assert.equal(failsNoVocalsScreen({ title, artist: "X" }), true, title);
  const clean = ["Humoresque", "Human Nature Suite", "Glorious Morning", "Fortunate Son Instrumental"];
  for (const title of clean) assert.equal(failsNoVocalsScreen({ title, artist: "X" }), false, title);
});


// ---- ordering by the listeners' verdicts (07.5, A6) ----

const p = (id: string): Piece => ({ id, title: id, artist: "A", kind: "score", vocals: "none", moodTags: ["dread"] });
const alts = [p("a"), p("b"), p("c"), p("d")];
const SET = "tension,dread";

test("demoted: misfits two to one over at least ten verdicts, and not before", () => {
  assert.equal(DEMOTE_MIN_VERDICTS, 10);
  assert.equal(demoted(undefined), false);
  assert.equal(demoted({ fits: 3, misfits: 6 }), false, "nine verdicts is too few");
  assert.equal(demoted({ fits: 4, misfits: 8 }), true, "exactly two to one over twelve");
  assert.equal(demoted({ fits: 0, misfits: 10 }), true);
  assert.equal(demoted({ fits: 4, misfits: 7 }), false, "under two to one");
});

test("alternates are ordered best-kept first for the chapter's exact emotion set; a demoted one goes last; none is removed", () => {
  const counts = {
    a: { [SET]: { fits: 4, misfits: 8 } },
    b: { [SET]: { fits: 1, misfits: 2 } },
    c: { [SET]: { fits: 5, misfits: 1 }, calm: { fits: 0, misfits: 50 } },
  };
  const out = orderAlternates(alts, ["dread", "tension"], counts);
  assert.deepEqual(out.map((x) => x.id), ["c", "d", "b", "a"], "c +4, d none, b -1, a demoted");
  // Another emotion set reads none of these counts: the scorer's order.
  assert.deepEqual(orderAlternates(alts, ["sorrow"], counts).map((x) => x.id), ["a", "b", "c", "d"]);
  // Ties keep the scorer's order.
  assert.deepEqual(orderAlternates(alts, ["tension", "dread"], {}).map((x) => x.id), ["a", "b", "c", "d"]);
  // A demoted piece with a better net score than another still goes after it.
  const d2 = { a: { [SET]: { fits: 0, misfits: 10 } }, b: { [SET]: { fits: 0, misfits: 20 } }, c: { [SET]: { fits: 0, misfits: 9 } } };
  assert.deepEqual(orderAlternates(alts, ["tension", "dread"], d2).map((x) => x.id), ["d", "c", "a", "b"]);
});

test("a job view's alternates are reordered; its piece, scene pieces, moods and everything else stay", () => {
  const mood = {
    chapterIndex: 0,
    chapterTitle: "One",
    emotions: [
      { emotion: "tension" as const, intensity: 0.8 },
      { emotion: "dread" as const, intensity: 0.5 },
    ],
    sources: [],
    coverage: "scored" as const,
    model: "m",
    version: "v",
    scoredAt: 1,
  };
  const view: JobView = {
    jobId: "f".repeat(64),
    state: "done",
    progress: { step: 1, steps: 1, chaptersDone: 2, chapters: 2 },
    result: {
      key: "f".repeat(64),
      model: "m",
      version: "v",
      scoredAt: 1,
      costUsd: 0,
      chapters: [
        { index: 0, title: "One", mood, pieces: { piece: p("main"), alternates: alts, scenePieces: [p("main"), p("a")] } },
        { index: 1, title: "Two", mood: { ...mood, chapterIndex: 1, chapterTitle: "Two", emotions: [], coverage: "too-little" }, pieces: null },
      ],
    },
  };
  assert.deepEqual(alternateIds(view), ["a", "b", "c", "d"]);
  const out = orderJobView(view, { d: { [SET]: { fits: 3, misfits: 0 } }, main: { [SET]: { fits: 0, misfits: 40 } } });
  const c0 = out.result!.chapters[0];
  assert.deepEqual(c0.pieces!.alternates.map((x) => x.id), ["d", "a", "b", "c"]);
  assert.equal(c0.pieces!.piece.id, "main", "the chapter's own piece is never swapped, even when demoted");
  assert.deepEqual(c0.pieces!.scenePieces!.map((x) => x.id), ["main", "a"]);
  assert.equal(out.result!.chapters[1].pieces, null);
  assert.deepEqual(view.result!.chapters[0].pieces!.alternates.map((x) => x.id), ["a", "b", "c", "d"], "the job's own view is not changed");
  const running: JobView = { ...view, state: "running", result: undefined };
  assert.equal(orderJobView(running, {}), running);
});
