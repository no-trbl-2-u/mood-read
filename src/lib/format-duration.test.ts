import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDuration } from "./format-duration.ts";

test("formats seconds under a minute as M:SS", () => {
  assert.equal(formatDuration(5), "0:05");
});

test("formats minutes and seconds without a leading hour", () => {
  assert.equal(formatDuration(65), "1:05");
});

test("formats an hour or more as H:MM:SS", () => {
  assert.equal(formatDuration(3725), "1:02:05");
});

test("clamps negative input to zero", () => {
  assert.equal(formatDuration(-10), "0:00");
});

test("clamps non-finite input to zero", () => {
  assert.equal(formatDuration(Number.NaN), "0:00");
});

test("floors fractional seconds", () => {
  assert.equal(formatDuration(59.9), "0:59");
});
