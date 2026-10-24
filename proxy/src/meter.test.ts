import assert from "node:assert/strict";
import { test } from "node:test";

import { BRAVE_USD_PER_QUERY, capFrom, createMeter, DEFAULT_CAP_USD, estimateUsage, FAILED_CALL_OUTPUT_TOKENS, monthOf, openAiCost, underCap, UNKNOWN_MODEL_PRICE } from "./meter.ts";
import { memoryStore } from "./store.ts";

test("the cap is one config value, $20 by default", () => {
  assert.equal(DEFAULT_CAP_USD, 20);
  assert.equal(capFrom(undefined), 20);
  assert.equal(capFrom(""), 20);
  assert.equal(capFrom("35.5"), 35.5);
  assert.equal(capFrom("0"), 0);
  assert.equal(capFrom("lots"), 20);
  assert.equal(capFrom("-4"), 20);
});

test("spend is metered per UTC month and adds up", async () => {
  const meter = createMeter(memoryStore());
  const oct = monthOf(Date.UTC(2026, 9, 31, 23, 59));
  const nov = monthOf(Date.UTC(2026, 10, 1, 0, 1));
  assert.equal(oct, "2026-10");
  assert.equal(nov, "2026-11");
  await meter.add(oct, 1.5);
  await meter.add(oct, 2.25);
  await meter.add(oct, -3);
  await meter.add(oct, Number.NaN);
  assert.equal(await meter.spent(oct), 3.75);
  assert.equal(await meter.spent(nov), 0);
});

test("a new run may start only while the month's spend is under the cap", async () => {
  const meter = createMeter(memoryStore());
  const now = Date.UTC(2026, 9, 10);
  assert.equal(await underCap(meter, 20, now), true);
  await meter.add(monthOf(now), 19.99);
  assert.equal(await underCap(meter, 20, now), true);
  await meter.add(monthOf(now), 0.01);
  assert.equal(await underCap(meter, 20, now), false);
  assert.equal(await underCap(meter, 20, Date.UTC(2026, 10, 1)), true, "a new month starts fresh");
  assert.equal(await underCap(meter, 0, Date.UTC(2026, 10, 1)), false, "a cap of 0 stops every new run");
});

test("costs: tokens by the model's price, unknown models priced high, a flat price per search", () => {
  assert.equal(openAiCost("gpt-5-mini", { input: 1_000_000, output: 1_000_000 }), 2.25);
  assert.equal(openAiCost("some-new-model", { input: 1_000_000, output: 0 }), UNKNOWN_MODEL_PRICE.input);
  assert.ok(BRAVE_USD_PER_QUERY > 0);
});

test("a failed call with no reported usage is estimated high: the request's length in, a full answer out (01.21)", () => {
  const req = { system: "s".repeat(300), user: "u".repeat(2700), schema: { type: "object" } };
  const est = estimateUsage(req);
  assert.ok(est.input >= Math.ceil(3000 / 4), "at least the usual four characters a token");
  assert.equal(est.output, FAILED_CALL_OUTPUT_TOKENS);
  assert.ok(openAiCost("gpt-5-mini", est) > 0);
});
