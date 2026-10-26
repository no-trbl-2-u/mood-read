import assert from "node:assert/strict";
import { test } from "node:test";

import { errorBand } from "./scoring-band.ts";

test("A26: an unreachable or failed job shows its error with Try again and Not now", () => {
  for (const state of ["unreachable", "failed"] as const) {
    const v = errorBand(state, { scored: false, canSetMood: false });
    assert.equal(v.error, state);
    assert.equal(v.dismiss, true);
  }
});

test("A26: the error never hides the scored line or Set the mood", () => {
  const v = errorBand("unreachable", { scored: true, canSetMood: true });
  assert.equal(v.scoredLine, true);
  assert.equal(v.setMood, true);
  const bare = errorBand("failed", { scored: false, canSetMood: false });
  assert.equal(bare.scoredLine, false);
  assert.equal(bare.setMood, false);
});
