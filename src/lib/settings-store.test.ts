import assert from "node:assert/strict";
import { test } from "node:test";

import { createSettingsStore, DEFAULT_SETTINGS, parseSettings, SOUNDSCAPE_OFF } from "./settings-store.ts";
import type { Kv } from "./library-store.ts";

function memoryKv(): Kv & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

test("A3: with nothing saved, Wi-Fi only is on, companion mode off, and no default soundscape is set", () => {
  assert.deepEqual(DEFAULT_SETTINGS, { wifiOnly: true, companionMode: false, defaultSoundscapeId: null });
  assert.deepEqual(createSettingsStore(memoryKv()).get(), DEFAULT_SETTINGS);
});

test("A3: each setting is saved on the device and survives reopening the app", () => {
  const kv = memoryKv();
  const store = createSettingsStore(kv);
  store.set({ wifiOnly: false });
  store.set({ companionMode: true });
  store.set({ defaultSoundscapeId: "tide" });
  const reopened = createSettingsStore(kv);
  assert.deepEqual(reopened.get(), { wifiOnly: false, companionMode: true, defaultSoundscapeId: "tide" });

  reopened.set({ defaultSoundscapeId: SOUNDSCAPE_OFF });
  assert.equal(createSettingsStore(kv).get().defaultSoundscapeId, SOUNDSCAPE_OFF);
  reopened.set({ defaultSoundscapeId: null, wifiOnly: true, companionMode: false });
  assert.deepEqual(createSettingsStore(kv).get(), DEFAULT_SETTINGS);
});

test("a change tells its listeners, and one that changes nothing does not", () => {
  const store = createSettingsStore(memoryKv());
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.set({ wifiOnly: false });
  store.set({ wifiOnly: false });
  assert.equal(calls, 1);
  off();
  store.set({ wifiOnly: true });
  assert.equal(calls, 1);
});

test("a malformed saved value falls back to the defaults, field by field", () => {
  for (const raw of ["not json", "null", "42", '"text"', "[true]", ""]) {
    assert.deepEqual(parseSettings(raw), DEFAULT_SETTINGS, raw);
  }
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"wifiOnly":"no","companionMode":true,"defaultSoundscapeId":7}'), {
    ...DEFAULT_SETTINGS,
    companionMode: true,
  });
  assert.deepEqual(parseSettings('{"defaultSoundscapeId":""}'), DEFAULT_SETTINGS);

  const kv = memoryKv();
  kv.setItem("settings", "{broken");
  const store = createSettingsStore(kv);
  assert.deepEqual(store.get(), DEFAULT_SETTINGS);
  store.set({ companionMode: true });
  assert.deepEqual(createSettingsStore(kv).get(), { ...DEFAULT_SETTINGS, companionMode: true });
});
