import assert from "node:assert/strict";
import { test } from "node:test";

import { createPlaylistStore } from "./playlist-store.ts";

function memoryKv(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const record = (bookId: string, ...ids: string[]) => ({ bookId, pieces: ids.map((id) => ({ id, key: `pieces/${id}.m4a` })), builtAt: 1 });

test("A4: a built playlist is kept on the device and read back after a restart", () => {
  const kv = memoryKv();
  const store = createPlaylistStore(kv);
  let heard = 0;
  store.subscribe(() => heard++);
  store.put(record("one", "a", "b"));
  store.put(record("two", "b"));
  assert.equal(heard, 2);
  assert.deepEqual(createPlaylistStore(kv).list(), [record("one", "a", "b"), record("two", "b")]);
  assert.deepEqual(store.get("two"), record("two", "b"));
  assert.equal(store.get("three"), null);
});

test("A5: putting a book's record again replaces it; removing the last clears the key", () => {
  const kv = memoryKv();
  const store = createPlaylistStore(kv);
  store.put(record("one", "a"));
  store.put(record("one", "c"));
  assert.deepEqual(store.list(), [record("one", "c")]);
  store.remove("one");
  store.remove("one");
  assert.deepEqual(store.list(), []);
  assert.equal(kv.data.has("playlists"), false);
});

test("a damaged record is left out, never thrown", () => {
  assert.deepEqual(createPlaylistStore(memoryKv({ playlists: "{nope" })).list(), []);
  const mixed = JSON.stringify([record("one", "a"), { bookId: 3 }, null, { bookId: "x", pieces: [{ id: 1 }], builtAt: 1 }]);
  assert.deepEqual(createPlaylistStore(memoryKv({ playlists: mixed })).list(), [record("one", "a")]);
});
