// Spec 06 A5, the native half of the 200% text and 44 px bars (06.5). The e2e leg checks both on the web build; on
// a phone, React Native text follows the OS text size by itself unless a component opts out, and a touch target
// is only as big as its box unless hit slop pads it invisibly. So no source under src/app, src/player or src/ui
// may turn font scaling off, cap it below 200%, cut text to a line count (rows grow instead), or lean on hit slop
// for a target: every control is at least `sizes.touch` (44) itself.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "player", "ui"];

/** Every A5 problem in one file's source, as "what line: text". */
export function a11yProblems(source: string): string[] {
  const problems: string[] = [];
  source.split("\n").forEach((line, i) => {
    const at = `${i + 1}: ${line.trim()}`;
    if (/allowFontScaling\s*[=:]\s*\{?\s*false/.test(line)) problems.push(`font scaling off ${at}`);
    for (const m of line.matchAll(/maxFontSizeMultiplier\s*[=:]\s*\{?\s*([\d.]+)/g)) {
      const cap = Number(m[1]);
      if (cap !== 0 && cap < 2) problems.push(`font scaling capped under 200% ${at}`);
    }
    if (/\bhitSlop\b/.test(line)) problems.push(`hit slop ${at}`);
    if (/\bnumberOfLines\b/.test(line)) problems.push(`text cut to a line count ${at}`);
  });
  return problems;
}

function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
  };
  for (const d of DIRS) walk(path.join(SRC, d));
  return out;
}

test("the guard catches font scaling turned off or capped, a line-count cut, and hit slop", () => {
  for (const line of [
    "<Text allowFontScaling={false}>",
    "allowFontScaling: false,",
    "<Text maxFontSizeMultiplier={1.5}>",
    "maxFontSizeMultiplier: 1,",
    "hitSlop={spacing.sm}",
    "<Text numberOfLines={1}>",
  ]) {
    assert.ok(a11yProblems(line).length > 0, `not caught: ${line}`);
  }
  for (const line of ["<Text>", "<Text allowFontScaling>", "maxFontSizeMultiplier={2}", "maxFontSizeMultiplier={0}"]) {
    assert.deepEqual(a11yProblems(line), [], `flagged: ${line}`);
  }
});

test("A5: text follows the OS text size to 200%, and no target leans on hit slop", () => {
  const files = sources();
  assert.ok(files.length > 10, "the scan found the screens");
  const report: string[] = [];
  for (const f of files) {
    for (const p of a11yProblems(readFileSync(f, "utf8"))) report.push(`${path.relative(SRC, f)} ${p}`);
  }
  assert.deepEqual(report, []);
});
