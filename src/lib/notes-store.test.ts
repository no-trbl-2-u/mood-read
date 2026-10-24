import assert from "node:assert/strict";
import { test } from "node:test";

import type { Kv } from "./library-store.ts";
import { createNoteStore } from "./notes-store.ts";

function memoryKv(): Kv {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

test("A30: the first-run scoring note shows until dismissed, then never again, even after reopening", () => {
  const kv = memoryKv();
  const store = createNoteStore(kv);
  assert.equal(store.dismissed("scoring-sent"), false);
  store.dismiss("scoring-sent");
  assert.equal(store.dismissed("scoring-sent"), true);
  assert.equal(createNoteStore(kv).dismissed("scoring-sent"), true);
});

test("A30: dismissing tells listeners once", () => {
  const store = createNoteStore(memoryKv());
  let calls = 0;
  const off = store.subscribe(() => (calls += 1));
  store.dismiss("scoring-sent");
  store.dismiss("scoring-sent");
  off();
  store.dismiss("scoring-sent");
  assert.equal(calls, 1);
});
