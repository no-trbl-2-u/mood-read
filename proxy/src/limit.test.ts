import assert from "node:assert/strict";
import { test } from "node:test";

import { clientOf, memoryLimiter, VERDICT_RATE } from "./limit.ts";

test("the verdict limiter lets a client through max times per window, each client apart, and again next window", async () => {
  let now = 0;
  const limiter = memoryLimiter({ max: 2, windowMs: 1000 }, () => now);
  assert.equal(await limiter.take("1.2.3.4"), true);
  assert.equal(await limiter.take("1.2.3.4"), true);
  assert.equal(await limiter.take("1.2.3.4"), false);
  assert.equal(await limiter.take("5.6.7.8"), true, "another client has its own count");
  now = 1000;
  assert.equal(await limiter.take("1.2.3.4"), true, "a new window starts again");
  assert.ok(VERDICT_RATE.max >= 2, "the app's one post a day, and a retry, always fit");
});

test("a client is Cloudflare's connecting address, or empty when there is none", () => {
  assert.equal(clientOf(new Request("https://x/", { headers: { "cf-connecting-ip": "9.9.9.9" } })), "9.9.9.9");
  assert.equal(clientOf(new Request("https://x/")), "");
});
