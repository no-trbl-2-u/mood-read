import assert from "node:assert/strict";
import { test } from "node:test";

import { countsAsWifi, createNetworkWatch, type NetworkType } from "./network-watch.ts";

const flush = () => new Promise<void>((r) => setImmediate(r));

function harness(initial: Promise<{ type?: NetworkType }>) {
  let push: (state: { type?: NetworkType }) => void = () => {};
  const watch = createNetworkWatch({ read: () => initial, listen: (fn) => void (push = fn) });
  return { watch, push: (type: NetworkType) => push({ type }) };
}

test("Wi-Fi and Ethernet count as Wi-Fi; mobile data, Bluetooth, WiMAX, other and none do not", () => {
  for (const t of ["WIFI", "ETHERNET"] as const) assert.equal(countsAsWifi(t), true, t);
  for (const t of ["CELLULAR", "BLUETOOTH", "WIMAX", "OTHER", "NONE"] as const) assert.equal(countsAsWifi(t), false, t);
});

test("a type the device cannot name counts as Wi-Fi, so the web build (always UNKNOWN online) is never held back", () => {
  assert.equal(countsAsWifi("UNKNOWN"), true);
  assert.equal(countsAsWifi("VPN"), true);
});

test("no is the answer until the first reading arrives, then the reading decides", async () => {
  const { watch } = harness(Promise.resolve({ type: "CELLULAR" }));
  assert.equal(watch.onWifi(), false);
  await flush();
  assert.equal(watch.onWifi(), false);

  const wifi = harness(Promise.resolve({ type: "WIFI" }));
  await flush();
  assert.equal(wifi.watch.onWifi(), true);
});

test("subscribers hear the first reading and each change, so a held-back download can start on its own", async () => {
  const { watch, push } = harness(Promise.resolve({ type: "CELLULAR" }));
  const seen: boolean[] = [];
  watch.subscribe(() => seen.push(watch.onWifi()));
  await flush();
  push("WIFI");
  push("CELLULAR");
  assert.deepEqual(seen, [false, true, false]);
});

test("a failed first reading counts as an unknown network rather than holding everything back forever", async () => {
  const { watch } = harness(Promise.reject(new Error("no module")));
  await flush();
  assert.equal(watch.onWifi(), true);
});

test("a change heard before the first read lands is not overwritten by that older read", async () => {
  let resolve: (s: { type?: NetworkType }) => void = () => {};
  const { watch, push } = harness(new Promise((r) => (resolve = r)));
  push("CELLULAR");
  resolve({ type: "WIFI" });
  await flush();
  assert.equal(watch.onWifi(), false);
});

test("an unsubscribed listener hears nothing more", async () => {
  const { watch, push } = harness(Promise.resolve({ type: "WIFI" }));
  let calls = 0;
  const off = watch.subscribe(() => calls++);
  await flush();
  off();
  push("CELLULAR");
  assert.equal(calls, 1);
});
