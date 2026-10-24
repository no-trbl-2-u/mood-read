import assert from "node:assert/strict";
import { test } from "node:test";

import { createDownloadStore } from "./download-store.ts";
import type { Kv } from "./library-store.ts";
import type { Download } from "./types.ts";

function memoryKv(): Kv & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function download(id: string): Download {
  return { id, target: { kind: "book", bookId: "b1" }, state: "queued", bytes: 0, totalBytes: null, error: null, attempts: 0, queuedAt: 0, updatedAt: 0 };
}

test("starts empty, and nothing saved survives nothing", () => {
  assert.deepEqual(createDownloadStore(memoryKv()).list(), []);
});

test("adds, patches and removes a download, and it survives reopening the store", () => {
  const kv = memoryKv();
  const store = createDownloadStore(kv);
  store.add(download("d1"));
  assert.deepEqual(store.list(), [download("d1")]);

  store.patch("d1", { state: "running", bytes: 40, totalBytes: 100 });
  assert.equal(store.get("d1")?.state, "running");
  assert.equal(store.get("d1")?.bytes, 40);

  const reopened = createDownloadStore(kv);
  assert.equal(reopened.get("d1")?.bytes, 40);

  store.remove("d1");
  assert.equal(store.get("d1"), undefined);
  assert.deepEqual(createDownloadStore(kv).list(), []);
});

test("patching or removing an id that is not there changes nothing and tells no listener", () => {
  const store = createDownloadStore(memoryKv());
  store.add(download("d1"));
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.patch("missing", { state: "done" });
  store.remove("missing");
  assert.equal(calls, 0);
  off();
});

test("a change tells its listeners, in order of add, patch, remove", () => {
  const store = createDownloadStore(memoryKv());
  let calls = 0;
  const off = store.subscribe(() => calls++);
  store.add(download("d1"));
  store.patch("d1", { bytes: 10 });
  store.remove("d1");
  assert.equal(calls, 3);
  off();
});

test("a malformed saved value reads as an empty queue, never a crash", () => {
  for (const raw of ["not json", "null", "42", '"text"', "{}"]) {
    const kv = memoryKv();
    kv.data.set("downloads", raw);
    assert.deepEqual(createDownloadStore(kv).list(), [], raw);
  }
});
