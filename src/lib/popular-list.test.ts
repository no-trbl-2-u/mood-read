// Browse's default list (05.20, A22): the merge (pre-scored first, each book once, in order) and the loader's calls
// and failures, against fake archive.org and proxy answers. No network.
import assert from "node:assert/strict";
import { test } from "node:test";

import type { LibriVoxSearchResult } from "./librivox-api.ts";
import { loadPopular, mergePopular } from "./popular-list.ts";

const PROXY = "https://proxy.example";
const book = (identifier: string, catalogId: string | null): LibriVoxSearchResult => ({
  identifier,
  title: identifier,
  creator: "A. Author",
  runtime: "1:00:00",
  description: null,
  catalogId,
});
const wonder = (intensity: number) => [{ emotion: "wonder" as const, intensity }];
const ids = (rows: LibriVoxSearchResult[]) => rows.map((r) => r.identifier);

test("pre-scored books first in the listing's order, then the popular page in download order, each book once", () => {
  const popular = [book("a", "1"), book("b", "2"), book("c", "3"), book("d", null)];
  const listing = [
    { id: "9", emotions: wonder(0.9) },
    { id: "3", emotions: wonder(0.3) },
    { id: "404", emotions: wonder(0.4) }, // found nowhere: left out
  ];
  const lookedUp = [book("i", "9"), book("c-other-edition", "3")];
  const out = mergePopular(listing, lookedUp, popular);
  assert.deepEqual(ids(out.rows), ["i", "c", "a", "b", "d"], "the popular page's edition wins; c is not repeated");
  assert.deepEqual(out.overall, { "9": wonder(0.9), "3": wonder(0.3) });
});

test("a popular book pre-scored but not in the listing still counts as pre-scored, after the listing's", () => {
  const popular = [book("a", "1"), book("b", "2"), book("c", "3")];
  const out = mergePopular([{ id: "1", emotions: wonder(0.1) }], [], popular, { "3": wonder(0.3) });
  assert.deepEqual(ids(out.rows), ["a", "c", "b"]);
  assert.deepEqual(Object.keys(out.overall).sort(), ["1", "3"]);
});

test("duplicates by identifier or LibriVox number collapse; no listing is just the popular page, unscored", () => {
  const popular = [book("a", "1"), book("a", "1"), book("a2", "1"), book("b", null), book("b", null)];
  assert.deepEqual(ids(mergePopular([], [], popular).rows), ["a", "b"]);
  assert.deepEqual(mergePopular([], [], popular).overall, {});
});

type Call = string;
function fakeFetch(answers: { prescored?: unknown; popular?: unknown; byNumber?: unknown; overall?: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    const pick = url.includes("/v1/prescored")
      ? answers.prescored
      : url.includes("/v1/overall")
        ? answers.overall
        : (new URL(url).searchParams.get("q") ?? "").includes("call_number:")
          ? answers.byNumber
          : answers.popular;
    if (pick instanceof Error) throw pick;
    if (typeof pick === "number") return new Response("down", { status: pick });
    if (typeof pick === "string") return new Response(pick);
    return Response.json(pick ?? {});
  };
  return { calls, fetchImpl };
}
const docs = (rows: { identifier: string; call_number: string | null }[]) => ({
  response: { docs: rows.map((r) => ({ ...r, title: r.identifier, creator: "A. Author", runtime: "1:00:00", description: null })) },
});

test("loadPopular: the listing and the popular page, then titles for missing numbers and scores for the rest", async () => {
  const { calls, fetchImpl } = fakeFetch({
    prescored: { books: [{ id: "9", emotions: wonder(0.9) }, { id: "1", emotions: wonder(0.1) }] },
    popular: docs([{ identifier: "a", call_number: "1" }, { identifier: "b", call_number: "2" }, { identifier: "c", call_number: "3" }]),
    byNumber: docs([{ identifier: "i", call_number: "9" }]),
    overall: { books: { "3": { emotions: wonder(0.3) } } },
  });
  const out = await loadPopular(PROXY, fetchImpl);
  assert.deepEqual(ids(out.rows), ["i", "a", "c", "b"]);
  assert.deepEqual(Object.keys(out.overall).sort(), ["1", "3", "9"]);
  assert.equal(calls.length, 4);
  assert.ok(calls.some((u) => u === `${PROXY}/v1/prescored?limit=20`));
  assert.ok(calls.some((u) => u === `${PROXY}/v1/overall?ids=2,3`), "only the popular page's numbers the listing lacks");
  const lookup = new URL(calls.find((u) => (new URL(u).searchParams.get("q") ?? "").includes("call_number:"))!).searchParams.get("q");
  assert.equal(lookup, "collection:librivoxaudio AND call_number:(9)", "only the listed numbers the popular page lacks");
});

test("loadPopular: a failed listing shows the popular page unscored, with no second proxy call", async () => {
  for (const prescored of [503, new Error("offline"), "not json"]) {
    const { calls, fetchImpl } = fakeFetch({ prescored, popular: docs([{ identifier: "a", call_number: "1" }, { identifier: "b", call_number: "2" }]) });
    const out = await loadPopular(PROXY, fetchImpl);
    assert.deepEqual(ids(out.rows), ["a", "b"]);
    assert.deepEqual(out.overall, {});
    assert.equal(calls.filter((u) => u.startsWith(PROXY)).length, 1);
  }
});

test("loadPopular: archive.org's popular page failing still shows the pre-scored books it can name", async () => {
  const { fetchImpl } = fakeFetch({ prescored: { books: [{ id: "9", emotions: wonder(0.9) }] }, popular: 503, byNumber: docs([{ identifier: "i", call_number: "9" }]) });
  const out = await loadPopular(PROXY, fetchImpl);
  assert.deepEqual(ids(out.rows), ["i"]);
});

test("loadPopular: nothing to show from archive.org throws, so Browse shows its prompt; an empty answer is an empty list", async () => {
  await assert.rejects(loadPopular(PROXY, fakeFetch({ prescored: 503, popular: 503 }).fetchImpl), /503/);
  await assert.rejects(loadPopular(PROXY, fakeFetch({ prescored: { books: [{ id: "9", emotions: wonder(0.9) }] }, popular: 503, byNumber: 503 }).fetchImpl), /503/);
  const empty = await loadPopular(PROXY, fakeFetch({ prescored: { books: [] }, popular: docs([]) }).fetchImpl);
  assert.deepEqual(empty, { rows: [], overall: {} });
});
