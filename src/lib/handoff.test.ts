import assert from "node:assert/strict";
import { test } from "node:test";

import { createHandoff, type HandoffSteps } from "./handoff.ts";

/** A promise resolved from outside, to hold a step open while the test presses something. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Steps over a fake player: the URI and the load are held open until the test lets them go. */
function fakeSteps() {
  const uri = deferred<string>();
  const loaded = deferred<void>();
  const log: string[] = [];
  const steps: HandoffSteps = {
    resolve: () => uri.promise,
    swap: (u) => log.push(`swap ${u}`),
    loaded: () => loaded.promise,
    land: async () => {
      log.push("land");
    },
    play: () => log.push("play"),
  };
  return { steps, uri, loaded, log };
}

test("A31: a pause pressed while the next file's URI is still being found holds once it loads", async () => {
  const h = createHandoff();
  const f = fakeSteps();
  const run = h.run(true, f.steps);
  assert.equal(h.wantsPlay(), true);
  h.pause();
  f.uri.resolve("blob:ch2");
  f.loaded.resolve();
  assert.equal(await run, "held");
  assert.deepEqual(f.log, ["swap blob:ch2", "land"]);
  assert.equal(h.loading(), false);
});

test("A31: a pause pressed while the file itself loads holds", async () => {
  const h = createHandoff();
  const f = fakeSteps();
  const run = h.run(true, f.steps);
  f.uri.resolve("blob:ch2");
  await Promise.resolve();
  h.pause();
  f.loaded.resolve();
  assert.equal(await run, "held");
  assert.ok(!f.log.includes("play"));
});

test("a play pressed during a paused load plays it once it is ready", async () => {
  const h = createHandoff();
  const f = fakeSteps();
  const run = h.run(false, f.steps);
  assert.equal(h.play(), true);
  f.uri.resolve("blob:ch2");
  f.loaded.resolve();
  assert.equal(await run, "played");
  assert.deepEqual(f.log, ["swap blob:ch2", "land", "play"]);
});

test("play and pause outside a load are left to the player", () => {
  const h = createHandoff();
  assert.equal(h.play(), false);
  assert.equal(h.pause(), false);
  assert.equal(h.wantsPlay(), null);
});

test("a newer load supersedes an older one, which never swaps or plays", async () => {
  const h = createHandoff();
  const a = fakeSteps();
  const b = fakeSteps();
  const first = h.run(true, a.steps);
  const second = h.run(false, b.steps);
  a.uri.resolve("blob:a");
  a.loaded.resolve();
  assert.equal(await first, "stale");
  assert.deepEqual(a.log, []);
  b.uri.resolve("blob:b");
  b.loaded.resolve();
  assert.equal(await second, "held");
});

test("cancel drops the load in flight", async () => {
  const h = createHandoff();
  const f = fakeSteps();
  const run = h.run(true, f.steps);
  h.cancel();
  assert.equal(h.loading(), false);
  f.uri.resolve("blob:x");
  assert.equal(await run, "stale");
  assert.deepEqual(f.log, []);
});

test("a failed load ends the load and rethrows; a superseded one fails quietly", async () => {
  const h = createHandoff();
  const f = fakeSteps();
  const run = h.run(true, f.steps);
  f.uri.reject(new Error("gone"));
  await assert.rejects(run, /gone/);
  assert.equal(h.loading(), false);

  const old = fakeSteps();
  const stale = h.run(true, old.steps);
  void h.run(false, fakeSteps().steps);
  old.uri.reject(new Error("gone"));
  assert.equal(await stale, "stale");
});

test("every change of the load's intent is reported, null once it settles", async () => {
  const seen: (boolean | null)[] = [];
  const h = createHandoff((p) => seen.push(p));
  const f = fakeSteps();
  const run = h.run(true, f.steps);
  h.pause();
  h.play();
  f.uri.resolve("blob:x");
  f.loaded.resolve();
  await run;
  assert.deepEqual(seen, [true, false, true, null]);
});
