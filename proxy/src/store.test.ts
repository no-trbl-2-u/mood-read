import assert from "node:assert/strict";
import { test } from "node:test";

import { createVerdictCounts, memoryStore, verdictCountsKey } from "./store.ts";

test("verdicts are kept as counts per piece and emotion set, never as rows (07.5, A6)", async () => {
  const store = memoryStore();
  const counts = createVerdictCounts(store);
  await counts.add([
    { pieceId: "a", emotions: ["tension", "dread"], verdict: "fits" },
    { pieceId: "a", emotions: ["tension", "dread"], verdict: "misfit" },
    { pieceId: "a", emotions: ["calm"], verdict: "fits" },
    { pieceId: "b", emotions: ["tension", "dread"], verdict: "misfit" },
  ]);
  await counts.add([{ pieceId: "a", emotions: ["tension", "dread"], verdict: "fits" }]);
  assert.deepEqual(await counts.counts(["a", "b", "c", "a"]), {
    a: { "tension,dread": { fits: 2, misfits: 1 }, calm: { fits: 1, misfits: 0 } },
    b: { "tension,dread": { fits: 0, misfits: 1 } },
  });
  // The store holds one record per piece, of counts only.
  assert.deepEqual(store.keys().sort(), [verdictCountsKey("a"), verdictCountsKey("b")]);
  for (const k of store.keys()) {
    const v = (await store.get<Record<string, Record<string, unknown>>>(k))!;
    for (const c of Object.values(v)) assert.deepEqual(Object.keys(c).sort(), ["fits", "misfits"]);
  }
});
