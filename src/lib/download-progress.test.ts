import assert from "node:assert/strict";
import { test } from "node:test";

import { createProgressSum } from "./download-progress.ts";

test("A25: bytes are reported as they arrive, with no total until every file's size is known", () => {
  const seen: [number, number | null][] = [];
  const sum = createProgressSum(3, (b, t) => seen.push([b, t]));
  sum.at(0)(100, null);
  sum.at(0)(250, null);
  assert.deepEqual(seen, [[100, null], [250, null]]);
});

test("A25: the total appears once every slot's size is known, and bytes stay cumulative across files", () => {
  const seen: [number, number | null][] = [];
  const sum = createProgressSum(2, (b, t) => seen.push([b, t]));
  sum.at(0)(1000, 1000);
  sum.at(1)(10, null);
  sum.at(1)(20, 500);
  assert.deepEqual(seen.at(-2), [1010, null]);
  assert.deepEqual(seen.at(-1), [1020, 1500]);
});

test("A25: a file that reports no size (a redirect says -1) keeps the total unknown without stopping the bytes", () => {
  const seen: [number, number | null][] = [];
  const sum = createProgressSum(2, (b, t) => seen.push([b, t]));
  sum.at(0)(5, null);
  sum.at(1)(7, 70);
  assert.deepEqual(seen.at(-1), [12, null]);
});

test("A25: tick re-reports the current sum, so a quiet stretch after the last file is not mistaken for a stall", () => {
  const seen: [number, number | null][] = [];
  const sum = createProgressSum(1, (b, t) => seen.push([b, t]));
  sum.at(0)(40, 40);
  sum.tick();
  assert.deepEqual(seen, [[40, 40], [40, 40]]);
});
