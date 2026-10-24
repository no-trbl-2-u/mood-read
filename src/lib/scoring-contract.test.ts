// The app and the proxy keep their own copies of the scoring contract (spec 01, Contracts); this holds them in step,
// and checks the A22 rule: no AI or search key, and no OpenAI or Brave address, anywhere in the app.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as proxy from "../../proxy/src/contract.ts";
import { parseBookRequest } from "../../proxy/src/validate.ts";
import { scoringRequest, type ScoringRequest } from "./scoring-api.ts";
import { EMOTIONS as PROXY_EMOTIONS, PIECE_KINDS } from "../../proxy/src/contract.ts";
import { EMOTIONS as THEME_EMOTIONS } from "../ui/theme.ts";
import { EMOTIONS, MAX_SCENES, MIN_SCENE_SPAN, SCENE_SPAN_STEP, type ChapterMood, type Piece, type RemoteChapter, type Scene } from "./types.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("one fixed emotion set: the app's, the theme's and the proxy's agree", () => {
  assert.deepEqual([...EMOTIONS], [...PROXY_EMOTIONS]);
  assert.deepEqual([...EMOTIONS], [...THEME_EMOTIONS]);
});

// The request: what the app sends is what the proxy accepts, both ways (05.9).
const requestToProxy = (r: ScoringRequest): proxy.BookRequest => r;
const requestToApp = (r: proxy.BookRequest): ScoringRequest => r;

test("the proxy accepts exactly what the app sends, catalog numbers included (05.9, A10)", () => {
  const chapters = [{ bookId: "b", index: 0, title: "Down the Rabbit-Hole", fileIndex: 0, start: 0, end: 1 }];
  const sent = scoringRequest({ title: "Alice", author: "Lewis Carroll", chapters, source: { kind: "librivox", librivoxId: "alice_librivox", catalogId: "200", gutenbergId: "11" } });
  assert.deepEqual(parseBookRequest(requestToApp(requestToProxy(sent))), { ok: true, book: sent });
  const imported = scoringRequest({ title: "Alice", author: "", chapters, source: { kind: "import" } });
  assert.deepEqual(parseBookRequest(imported), { ok: true, book: imported });
});

test("piece kinds agree", () => {
  const kinds: Piece["kind"][] = ["score", "instrumental", "ambient"];
  assert.deepEqual(kinds, [...PIECE_KINDS]);
});

test("scene limits agree: at most four scenes, spans in steps of 0.05, none under 0.1 (07.1)", () => {
  assert.deepEqual([MAX_SCENES, SCENE_SPAN_STEP, MIN_SCENE_SPAN], [proxy.MAX_SCENES, proxy.SCENE_SPAN_STEP, proxy.MIN_SCENE_SPAN]);
  assert.deepEqual([MAX_SCENES, SCENE_SPAN_STEP, MIN_SCENE_SPAN], [4, 0.05, 0.1]);
});

// Typechecked both ways (pnpm typecheck): a proxy chapter is an app chapter and back, scenes and scene pieces included.
const toApp = (c: proxy.ChapterResult): RemoteChapter => c;
const toProxy = (c: RemoteChapter): proxy.ChapterResult => c;
const sceneBothWays = (s: proxy.Scene): Scene => s;
const sceneBack = (s: Scene): proxy.Scene => s;

test("a scored chapter with scenes and scene pieces reads the same on both sides (07.1)", () => {
  const piece: proxy.Piece = { id: "a--b", title: "B", artist: "A", kind: "score", vocals: "none", moodTags: ["dread"] };
  const mood: proxy.ChapterMood = {
    chapterIndex: 0,
    chapterTitle: "One",
    emotions: [{ emotion: "dread", intensity: 0.8 }],
    scenes: [
      { emotions: [{ emotion: "calm", intensity: 0.5 }], span: 0.4 },
      { emotions: [{ emotion: "dread", intensity: 0.9 }], span: 0.6 },
    ],
    sources: [],
    coverage: "scored",
    model: "m",
    version: proxy.SCORER_VERSION,
    scoredAt: 1,
  };
  const chapter: proxy.ChapterResult = { index: 0, title: "One", mood, pieces: { piece, alternates: [piece, piece], scenePieces: [piece, piece] } };
  const app = toApp(toProxy(toApp(chapter)));
  const appMood: ChapterMood = app.mood;
  assert.deepEqual(appMood.scenes?.map((s) => sceneBack(sceneBothWays(s)).span), [0.4, 0.6]);
  assert.equal(app.pieces?.scenePieces?.length, appMood.scenes?.length);
  // A scene has exactly two fields: emotions and a span, never text (A1).
  for (const s of appMood.scenes ?? []) assert.deepEqual(Object.keys(s).sort(), ["emotions", "span"]);
});

test("a book cached before 07.1, with no scenes and no scene pieces, is still a valid chapter on both sides", () => {
  const piece: Piece = { id: "a--b", title: "B", artist: "A", kind: "score", vocals: "none", moodTags: ["dread"] };
  const old: RemoteChapter = {
    index: 0,
    title: "One",
    mood: { chapterIndex: 0, chapterTitle: "One", emotions: [{ emotion: "dread", intensity: 0.8 }], sources: [], coverage: "scored", model: "m", version: "01.2.1", scoredAt: 1 },
    pieces: { piece, alternates: [piece, piece] },
  };
  assert.equal(toProxy(old).mood.scenes, undefined);
  assert.equal(toProxy(old).pieces?.scenePieces, undefined);
});

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : [p];
  });
}

test("no AI or search key, and no OpenAI or Brave address, ships in the app (A22)", () => {
  const shipped = [...files(path.join(ROOT, "src")).filter((f) => /\.(ts|tsx|js|json)$/.test(f) && !/\.test\.ts$/.test(f)), path.join(ROOT, "app.json"), path.join(ROOT, "eas.json")];
  const forbidden: [string, RegExp][] = [
    ["an OpenAI-style key", /\bsk-[A-Za-z0-9_-]{16,}/],
    ["a Brave key shape", /\bBSA[A-Za-z0-9_-]{20,}/],
    ["the OpenAI API host", /api\.openai\.com/i],
    ["the Brave Search API host", /api\.search\.brave\.com/i],
    ["a key's env name", /OPENAI_API_KEY|BRAVE_SEARCH_API_KEY|EXPO_PUBLIC_[A-Z_]*(KEY|TOKEN|SECRET)/],
    ["a bearer token", /authorization['"]?\s*:\s*['"`]Bearer/i],
  ];
  for (const f of shipped) {
    const text = fs.readFileSync(f, "utf8");
    for (const [what, re] of forbidden) assert.doesNotMatch(text, re, `${what} in ${path.relative(ROOT, f)}`);
  }
});

test("the app reaches the proxy at one configured base URL, a public config value", () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));
  const url = app.expo.extra.scoringProxyUrl;
  assert.match(url, /^https:\/\/[^/]+$/);
});
