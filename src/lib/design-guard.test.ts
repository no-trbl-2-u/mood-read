// Spec 06 A4, made checkable: every built screen takes its colours and sizes from the design system, so no colour
// or size lives outside src/ui/theme.ts. This scans every source file under src/app, src/player and src/ui (but
// theme.ts itself and the verbatim license texts) and fails on:
//   - a colour literal: a "#rgb"-style hex string, rgb()/rgba()/hsl()/hsla(), or any colour prop given a string;
//   - a number in a size prop (fontSize, lineHeight, width, height, padding*, margin*, gap, *Radius, *Width, top,
//     left, right, bottom, opacity, shadows, durations), in a style object or as a JSX prop (size, hitSlop...).
// The allowances, and only these: 0; a percentage string (`"85%"`, `${f * 100}%`); halving a token (`/ 2`, to
// centre a thumb on its point). Everything else is a token: add one to theme.ts and record it in
// design/system/DECISION.md.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "player", "ui"];
/** Not scanned: the tokens themselves, and license texts kept word for word. */
const EXEMPT = new Set(["ui/theme.ts", "ui/licenses.ts"]);

const SIZE_PROPS =
  "fontSize|lineHeight|letterSpacing|width|height|minWidth|minHeight|maxWidth|maxHeight|flexBasis|" +
  "padding\\w*|margin\\w*|gap|rowGap|columnGap|border\\w*Radius|border\\w*Width|outlineWidth|outlineOffset|" +
  "top|left|right|bottom|inset\\w*|opacity|elevation|shadow\\w*|duration|delay";
// The value runs to the next comma, brace or bracket, a template literal counting as one piece.
const STYLE_SIZE = new RegExp(`\\b(${SIZE_PROPS})\\s*:\\s*((?:\`[^\`]*\`|[^,}\\]\\n\`])*)`, "g");
const JSX_SIZE = /(?:^|\s)(size|width|height|hitSlop|strokeWidth|minWidth|minHeight)=\{([^}]*)\}/g;
const HEX = /["'`]#[0-9a-fA-F]{3,8}\b/;
const FUNC_COLOUR = /\b(rgba?|hsla?)\(/;
const COLOUR_STRING = /\b\w*[cC]olor\s*[:=]\s*\{?\s*["'`]/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** True when an expression holds a number that is not an allowance. */
function hasLiteralSize(expr: string): boolean {
  const cleaned = expr
    .replace(/`[^`]*%`/g, "") // a percentage template
    .replace(/["'][^"']*%["']/g, "") // a percentage string
    .replace(/\/\s*2\b/g, ""); // halving a token
  const numbers = cleaned.match(/(?<![\w$.])\d*\.?\d+/g) ?? [];
  return numbers.some((n) => Number(n) !== 0);
}

/** Every A4 problem in one file's source, as "line: text". */
export function designProblems(source: string): string[] {
  const problems: string[] = [];
  stripComments(source)
    .split("\n")
    .forEach((line, i) => {
      const at = `${i + 1}: ${line.trim()}`;
      if (HEX.test(line) || FUNC_COLOUR.test(line) || COLOUR_STRING.test(line)) problems.push(`colour ${at}`);
      for (const m of line.matchAll(STYLE_SIZE)) if (hasLiteralSize(m[2]!)) problems.push(`size ${at}`);
      for (const m of line.matchAll(JSX_SIZE)) if (hasLiteralSize(m[2]!)) problems.push(`size ${at}`);
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
  return out.filter((f) => !EXEMPT.has(path.relative(SRC, f).split(path.sep).join("/")));
}

test("the guard catches each kind of literal it bans", () => {
  const bad = [
    'color: "#fff"',
    "backgroundColor: 'rgba(0, 0, 0, 0.5)'",
    "backgroundColor: `hsl(${h}, 30%, 28%)`",
    'borderColor: "transparent"',
    '<Icon color="red" />',
    "fontSize: 15",
    "lineHeight: 20,",
    "paddingHorizontal: spacing.sm + 2",
    "borderRadius: 18",
    "minHeight: 36",
    "gap: 2 }",
    "opacity: 0.4",
    "top: 4, left: 4",
    "<Cover width={46} />",
    "<Icon size={24} />",
    "hitSlop={8}",
  ];
  for (const line of bad) assert.ok(designProblems(line).length > 0, `not caught: ${line}`);
});

test("the guard lets tokens and its explicit allowances through", () => {
  const good = [
    "color: colors.text",
    "fontSize: typography.body.fontSize",
    "paddingBottom: Math.max(insets.bottom, spacing.sm)",
    "borderWidth: 0",
    "width: `${shown * 100}%`",
    'maxHeight: "85%"',
    "marginLeft: -sizes.thumb / 2",
    "top: anchor.top, right: anchor.right",
    "hitSlop={spacing.sm}",
    "<Cover width={sizes.coverWidth} height={sizes.coverHeight} />",
    "// a comment with #fff and fontSize: 15 in it",
    "flex: 1",
  ];
  for (const line of good) assert.deepEqual(designProblems(line), [], `flagged: ${line}`);
});

test("A4: no colour or size outside src/ui/theme.ts in src/app, src/player or src/ui", () => {
  const files = sources();
  assert.ok(files.length > 10, "the scan found the screens");
  const report: string[] = [];
  for (const f of files) {
    for (const p of designProblems(readFileSync(f, "utf8"))) report.push(`${path.relative(SRC, f)} ${p}`);
  }
  assert.deepEqual(report, []);
});
