import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchOverall, fetchPrescored, PRESCORED_LIMIT, readOverall, readPrescored } from "./overall-api.ts";

const BASE = "https://proxy.example/";

test("one call per page: only valid LibriVox numbers, deduplicated, to the read-only route", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Response.json({ books: { "101": { emotions: [{ emotion: "wonder", intensity: 0.8 }, { emotion: "joy", intensity: 0.6 }] } } });
  };
  const out = await fetchOverall(BASE, fetchImpl, ["101", null, "202", "101", "abc", undefined, "0"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://proxy.example/v1/overall?ids=101,202");
  assert.equal(calls[0].init, undefined, "a plain GET: no body, no key, no header");
  assert.deepEqual(out, { "101": [{ emotion: "wonder", intensity: 0.8 }, { emotion: "joy", intensity: 0.6 }] });
});

test("no numbers, no call", async () => {
  let called = false;
  const out = await fetchOverall(BASE, async () => ((called = true), Response.json({})), [null, undefined]);
  assert.deepEqual(out, {});
  assert.equal(called, false);
});

test("any failure reads as nothing scored, so Browse still works", async () => {
  assert.deepEqual(await fetchOverall(BASE, async () => new Response("down", { status: 503 }), ["1"]), {});
  assert.deepEqual(await fetchOverall(BASE, async () => { throw new Error("offline"); }, ["1"]), {});
  assert.deepEqual(await fetchOverall(BASE, async () => new Response("not json"), ["1"]), {});
});

test("only the book's overall emotions are read: the fixed set, at most three, strongest first; nothing else kept", () => {
  const out = readOverall(
    {
      books: {
        "1": {
          emotions: [
            { emotion: "calm", intensity: 0.2, chapterTitle: "A secret" },
            { emotion: "dread", intensity: 0.9 },
            { emotion: "lust", intensity: 0.7 },
            { emotion: "joy", intensity: 0.5 },
            { emotion: "sorrow", intensity: 0.4 },
          ],
          chapters: [{ title: "A secret" }],
        },
        "2": { emotions: [] },
        "3": { emotions: [{ emotion: "joy", intensity: 0.5 }] },
      },
    },
    ["1", "2"],
  );
  assert.deepEqual(out, { "1": [{ emotion: "dread", intensity: 0.9 }, { emotion: "joy", intensity: 0.5 }, { emotion: "sorrow", intensity: 0.4 }] });
  assert.doesNotMatch(JSON.stringify(out), /secret|chapter/i);
  assert.deepEqual(readOverall(null, ["1"]), {});
});

test("the pre-scored listing (05.20): one plain GET, bounded, read in the proxy's order, anything off dropped", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Response.json({
      books: [
        { id: "9", emotions: [{ emotion: "joy", intensity: 0.2 }, { emotion: "wonder", intensity: 0.7 }], chapterTitle: "A secret" },
        { id: "3", emotions: [{ emotion: "dread", intensity: 0.5 }] },
        { id: "9", emotions: [{ emotion: "calm", intensity: 0.5 }] },
        { id: "0", emotions: [{ emotion: "calm", intensity: 0.5 }] },
        { id: "5", emotions: [{ emotion: "not-an-emotion", intensity: 0.5 }] },
        { id: 7, emotions: [{ emotion: "calm", intensity: 0.5 }] },
      ],
    });
  };
  const out = await fetchPrescored(BASE, fetchImpl);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://proxy.example/v1/prescored?limit=${PRESCORED_LIMIT}`);
  assert.equal(calls[0].init, undefined, "a plain GET: no body, no key, no header");
  assert.deepEqual(out, [
    { id: "9", emotions: [{ emotion: "wonder", intensity: 0.7 }, { emotion: "joy", intensity: 0.2 }] },
    { id: "3", emotions: [{ emotion: "dread", intensity: 0.5 }] },
  ]);
  assert.equal(readPrescored({ books: Array.from({ length: 80 }, (_, i) => ({ id: String(i + 1), emotions: [{ emotion: "joy", intensity: 0.5 }] })) }).length, PRESCORED_LIMIT);
});

test("a failed listing is null (the proxy is down), an empty one is empty", async () => {
  assert.equal(await fetchPrescored(BASE, async () => new Response("down", { status: 503 })), null);
  assert.equal(await fetchPrescored(BASE, async () => { throw new Error("offline"); }), null);
  assert.equal(await fetchPrescored(BASE, async () => new Response("not json")), null);
  assert.deepEqual(await fetchPrescored(BASE, async () => Response.json({ books: [] })), []);
  assert.equal(await fetchPrescored(BASE, async () => Response.json({ books: { "1": {} } })), null, "not a listing");
});
