import assert from "node:assert/strict";
import { test } from "node:test";

import { colors, contrastPairs, EMOTIONS, emotionHues } from "../ui/theme.ts";
import { aaMinimum, contrastRatio, luminance } from "./contrast.ts";

test("contrast ratio runs from 1 (same colour) to 21 (black on white)", () => {
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff") * 100) / 100, 21);
  assert.equal(contrastRatio("#000000", "#ffffff"), contrastRatio("#ffffff", "#000000"));
});

test("a known pair matches the WCAG reference value", () => {
  // #767676 on white is the classic 4.54:1 grey.
  assert.equal(Math.round(contrastRatio("#767676", "#ffffff") * 100) / 100, 4.54);
});

test("luminance rejects anything that is not opaque #rrggbb", () => {
  assert.throws(() => luminance("rgba(0,0,0,0.5)"));
  assert.throws(() => luminance("#fff"));
});

test("every theme pair meets WCAG 2.2 AA", () => {
  for (const p of contrastPairs) {
    const ratio = contrastRatio(p.fg, p.bg);
    assert.ok(ratio >= aaMinimum(p.kind), `${p.name}: ${ratio.toFixed(2)} < ${aaMinimum(p.kind)}`);
  }
});

test("every emotion has a hue and a contrast pair for its chip label", () => {
  for (const e of EMOTIONS) {
    assert.match(emotionHues[e], /^#[0-9a-f]{6}$/i);
    assert.ok(contrastPairs.some((p) => p.bg === emotionHues[e] && p.fg === colors.onAccent && p.kind === "text"));
  }
});

test("the body-text pairs are all checked at the 4.5 bar", () => {
  for (const fg of [colors.text, colors.textMuted]) {
    for (const bg of [colors.background, colors.surface, colors.raised]) {
      assert.ok(contrastPairs.some((p) => p.fg === fg && p.bg === bg && p.kind === "text"));
    }
  }
});

test("the v2 boards' two dark-on-colour pairs are checked: Finished on pop, Delete book on danger", () => {
  for (const bg of [colors.pop, colors.danger]) {
    assert.ok(contrastPairs.some((p) => p.fg === colors.onAccent && p.bg === bg && p.kind === "text"));
  }
  assert.equal(Math.round(contrastRatio(colors.onAccent, colors.pop) * 100) / 100, 6.41);
  assert.equal(Math.round(contrastRatio(colors.onAccent, colors.danger) * 100) / 100, 7.72);
});
