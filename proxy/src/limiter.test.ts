import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createRateLimiter,
  DAY_MS,
  DEFAULT_RESCORE_MIN_AGE_DAYS,
  DEFAULT_RUNS_PER_CLIENT_PER_HOUR,
  DEFAULT_RUNS_PER_HOUR,
  HOUR_MS,
  limitsFrom,
  rescoreMinAgeFrom,
  retryAfterSeconds,
} from "./limiter.ts";
import { memoryStore } from "./store.ts";

const T0 = Date.UTC(2026, 9, 24, 10, 0, 0);

test("the limits are config values with safe defaults: 3 new books per client an hour, 30 in all, rescore after 7 days", () => {
  assert.deepEqual(limitsFrom({}), { perClient: DEFAULT_RUNS_PER_CLIENT_PER_HOUR, global: DEFAULT_RUNS_PER_HOUR, windowMs: HOUR_MS });
  assert.equal(DEFAULT_RUNS_PER_CLIENT_PER_HOUR, 3);
  assert.equal(DEFAULT_RUNS_PER_HOUR, 30);
  assert.deepEqual(limitsFrom({ RUNS_PER_CLIENT_PER_HOUR: "5", RUNS_PER_HOUR: "100" }), { perClient: 5, global: 100, windowMs: HOUR_MS });
  assert.equal(limitsFrom({ RUNS_PER_CLIENT_PER_HOUR: "0" }).perClient, 0, "zero stops new runs");
  for (const bad of ["", " ", "-1", "abc", "2.5", "Infinity"]) {
    assert.equal(limitsFrom({ RUNS_PER_CLIENT_PER_HOUR: bad }).perClient, DEFAULT_RUNS_PER_CLIENT_PER_HOUR, `"${bad}"`);
    assert.equal(limitsFrom({ RUNS_PER_HOUR: bad }).global, DEFAULT_RUNS_PER_HOUR, `"${bad}"`);
  }
  assert.equal(DEFAULT_RESCORE_MIN_AGE_DAYS, 7);
  assert.equal(rescoreMinAgeFrom(undefined), 7 * DAY_MS);
  assert.equal(rescoreMinAgeFrom("1.5"), 1.5 * DAY_MS);
  assert.equal(rescoreMinAgeFrom("0"), 0);
  for (const bad of ["", "-2", "x"]) assert.equal(rescoreMinAgeFrom(bad), 7 * DAY_MS, `"${bad}"`);
});

test("one client starts at most its limit of new runs an hour; others are unaffected (A34)", async () => {
  const limiter = createRateLimiter(memoryStore(), { perClient: 3, global: 30, windowMs: HOUR_MS });
  for (let i = 0; i < 3; i++) assert.deepEqual(await limiter.admit("203.0.113.7", T0 + i), { ok: true });
  const refused = await limiter.admit("203.0.113.7", T0 + 15 * 60_000);
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.reason === "client-limit");
  assert.ok(!refused.ok && refused.retryAfterMs === 45 * 60_000, "retry once the hour's window ends");
  assert.deepEqual(await limiter.admit("198.51.100.2", T0 + 20 * 60_000), { ok: true }, "another client still may");
  assert.deepEqual(await limiter.admit("203.0.113.7", T0 + HOUR_MS), { ok: true }, "the next hour starts fresh");
});

test("a global ceiling caps new runs an hour across every client (A34)", async () => {
  const limiter = createRateLimiter(memoryStore(), { perClient: 3, global: 4, windowMs: HOUR_MS });
  for (let i = 0; i < 4; i++) assert.equal((await limiter.admit(`10.0.0.${i}`, T0)).ok, true);
  const refused = await limiter.admit("10.0.0.99", T0 + 1000);
  assert.ok(!refused.ok && refused.reason === "global-limit");
  assert.ok(!refused.ok && refused.retryAfterMs === HOUR_MS - 1000);
});

test("a refusal counts nothing, so hammering past the limit never extends it", async () => {
  const limiter = createRateLimiter(memoryStore(), { perClient: 1, global: 2, windowMs: HOUR_MS });
  assert.equal((await limiter.admit("a", T0)).ok, true);
  for (let i = 0; i < 20; i++) assert.equal((await limiter.admit("a", T0)).ok, false);
  assert.equal((await limiter.admit("b", T0)).ok, true, "a's refusals did not use up the global ceiling");
});

test("the client is held only as a salted hash, in one window, and the window and its salt are dropped when it ends (rule 6)", async () => {
  const store = memoryStore();
  let salts = 0;
  const limiter = createRateLimiter(store, { perClient: 3, global: 30, windowMs: HOUR_MS }, () => `salt-${++salts}`);
  await limiter.admit("203.0.113.7", T0);
  const raw = JSON.stringify(await store.get("window"));
  assert.doesNotMatch(raw, /203\.0\.113\.7/, "the address itself is never stored");
  assert.deepEqual(store.keys(), ["window"], "one window, nothing else");

  // A new window takes a new salt, so the same address hashes differently and old hashes cannot be linked to it.
  const first = Object.keys(((await store.get("window")) as { clients: Record<string, number> }).clients);
  await limiter.admit("203.0.113.7", T0 + HOUR_MS);
  const second = Object.keys(((await store.get("window")) as { clients: Record<string, number> }).clients);
  assert.equal(first.length, 1);
  assert.notDeepEqual(first, second);
  assert.equal(salts, 2);

  assert.equal(limiter.windowEnd(T0 + HOUR_MS), T0 + 2 * HOUR_MS);
  await limiter.expire(T0 + HOUR_MS + 1);
  assert.deepEqual(store.keys(), ["window"], "a live window is kept");
  await limiter.expire(T0 + 2 * HOUR_MS);
  assert.deepEqual(store.keys(), [], "an ended window is deleted, hashes, salt and all");
});

test("Retry-After is whole seconds, at least one", () => {
  assert.equal(retryAfterSeconds(0), 1);
  assert.equal(retryAfterSeconds(1), 1);
  assert.equal(retryAfterSeconds(1500), 2);
  assert.equal(retryAfterSeconds(7 * DAY_MS), 7 * 86_400);
});
