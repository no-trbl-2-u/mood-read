// The app and the proxy keep their own copies of the scoring contract (spec 01, Contracts); this holds them in step,
// and checks the A22 rule: no AI or search key, and no OpenAI or Brave address, anywhere in the app.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { EMOTIONS as PROXY_EMOTIONS, PIECE_KINDS } from "../../proxy/src/contract.ts";
import { EMOTIONS as THEME_EMOTIONS } from "../ui/theme.ts";
import { EMOTIONS, type Piece } from "./types.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("one fixed emotion set: the app's, the theme's and the proxy's agree", () => {
  assert.deepEqual([...EMOTIONS], [...PROXY_EMOTIONS]);
  assert.deepEqual([...EMOTIONS], [...THEME_EMOTIONS]);
});

test("piece kinds agree", () => {
  const kinds: Piece["kind"][] = ["score", "instrumental", "ambient"];
  assert.deepEqual(kinds, [...PIECE_KINDS]);
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
