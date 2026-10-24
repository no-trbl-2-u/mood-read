import assert from "node:assert/strict";
import { test } from "node:test";

import type { EmotionScore, JobView, Piece } from "./contract.ts";
import {
  askEmotions,
  candidateCount,
  candidateRequest,
  choosePieces,
  chooseScenePieces,
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

// ---- one piece per scene (07.1, A20) ----

const scenes = [
  { emotions: [{ emotion: "calm" as const, intensity: 0.6 }], span: 0.4 },
  { emotions: [{ emotion: "dread" as const, intensity: 0.9 }], span: 0.6 },
];

test("a chapter with scenes asks for pieces that fit each scene too, by emotions alone, and for more of them", () => {
  const r = candidateRequest({ title: "Dracula", author: "Bram Stoker", chapters: ["a", "b"] }, [{ index: 0, emotions, exclude: [], scenes }]);
  assert.match(r.user, /^Chapter 1: dread 0\.9, tension 0\.4\. Scenes in order: 1\) calm 0\.6; 2\) dread 0\.9\. Suggest \d+ pieces, some for each scene\.$/m);
  assert.ok(candidateCount({ index: 0, emotions, exclude: [], scenes }) > candidateCount({ index: 0, emotions, exclude: [] }));
  const flat = candidateRequest({ title: "Dracula", author: "Bram Stoker", chapters: ["a"] }, [{ index: 0, emotions, exclude: [], scenes: [{ emotions, span: 1 }] }]);
  assert.match(flat.user, /^Chapter 1: dread 0\.9, tension 0\.4\.$/m, "one scene is the chapter: asked as before");
  assert.deepEqual(new Set(askEmotions({ index: 0, emotions, exclude: [], scenes }).map((e) => e.emotion)), new Set(["dread", "tension", "calm"]));
});

test("the chapter's piece and alternates still fit the chapter's own emotions, even when scene pieces fit others (A14)", () => {
  const passed = [c("Calm Only", { moodTags: ["calm"] }), c("A"), c("B", { moodTags: ["tension"] }), c("C")];
  const p = choosePieces(passed, emotions)!;
  assert.ok([p.piece, ...p.alternates].every((x) => x.moodTags.some((t) => t === "dread" || t === "tension")));
  assert.equal(choosePieces([c("Calm Only", { moodTags: ["calm"] }), c("A"), c("B", { moodTags: ["calm"] })], emotions), null);
});

test("one piece per scene, the best fit among pieces that passed every check; a scene nothing fits plays the chapter's piece", () => {
  const passed = [c("A"), c("B", { moodTags: ["tension"] }), c("C"), c("Still Water", { moodTags: ["calm"] })];
  const chosen = choosePieces(passed, emotions)!;
  const per = chooseScenePieces(passed, scenes, chosen);
  assert.equal(per.length, scenes.length);
  assert.equal(per[0].title, "Still Water");
  assert.equal(per[1].id, chosen.piece.id, "ties go to the chapter's piece");
  const joyless = chooseScenePieces(passed, [{ emotions: [{ emotion: "joy", intensity: 1 }], span: 0.5 }, scenes[1]], chosen);
  assert.equal(joyless[0].id, chosen.piece.id);
  assert.ok(per.every((x) => x.vocals === "none"));
});

test("a one-scene chapter plays its own piece", () => {
  const passed = [c("A"), c("B"), c("C"), c("Still Water", { moodTags: ["calm"] })];
  const chosen = choosePieces(passed, emotions)!;
  assert.deepEqual(chooseScenePieces(passed, [{ emotions: [{ emotion: "calm", intensity: 1 }], span: 1 }], chosen), [chosen.piece]);
});

test("a scene piece goes through the same guard: a vocal or screened candidate never becomes one (A20)", () => {
  const rejected = new Set<string>();
  const all = [c("Calm Song", { moodTags: ["calm"] }), c("Calm Hum Theme", { moodTags: ["calm"], vocals: "unsure" }), c("A"), c("B"), c("C")];
  const passed = firstGuard(all, askEmotions({ index: 0, emotions, exclude: [], scenes }), rejected);
  const chosen = choosePieces(passed, emotions)!;
  const per = chooseScenePieces(passed, scenes, chosen);
  assert.equal(per[0].id, chosen.piece.id, "no calm piece survived the guard, so the calm scene plays the chapter's piece");
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
