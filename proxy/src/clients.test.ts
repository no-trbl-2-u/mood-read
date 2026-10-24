import assert from "node:assert/strict";
import { test } from "node:test";

import { BRAVE_ENDPOINT, braveClient, OPENAI_ENDPOINT, openAiClient } from "./clients.ts";

type Call = { url: string; init?: RequestInit };
const fakeFetch = (body: unknown, status = 200) => {
  const calls: Call[] = [];
  const f = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { f, calls };
};

test("brave: one GET with the key in its header, hits cleaned and snippets capped", async () => {
  const { f, calls } = fakeFetch({
    web: {
      results: [
        { url: "https://a.example/x", title: "<strong>A</strong>", description: "first <em>bit</em>", extra_snippets: ["more", 3] },
        { url: "ftp://nope", title: "bad" },
        { url: "https://b.example", description: "x".repeat(2000) },
      ],
    },
  });
  const hits = await braveClient("brave-test-key", f).search('"Dracula" review');
  const u = new URL(calls[0].url);
  assert.equal(`${u.origin}${u.pathname}`, BRAVE_ENDPOINT);
  assert.equal(u.searchParams.get("q"), '"Dracula" review');
  assert.equal((calls[0].init?.headers as Record<string, string>)["x-subscription-token"], "brave-test-key");
  assert.deepEqual(hits[0], { url: "https://a.example/x", title: "A", snippet: "first bit more" });
  assert.equal(hits.length, 2);
  assert.equal(hits[1].title, "https://b.example");
  assert.ok(hits[1].snippet.length <= 700);
});

test("brave: an error status throws", async () => {
  const { f } = fakeFetch({}, 429);
  await assert.rejects(braveClient("k", f).search("q"), /429/);
});

test("openai: a strict json_schema request with the key as a bearer token; the answer parsed, usage counted", async () => {
  const { f, calls } = fakeFetch({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 12, completion_tokens: 3 } });
  const client = openAiClient("openai-test-key", "gpt-5-mini", f);
  const out = await client.complete({ system: "s", user: "u", name: "thing", schema: { type: "object" } });
  assert.equal(calls[0].url, OPENAI_ENDPOINT);
  assert.equal((calls[0].init?.headers as Record<string, string>).authorization, "Bearer openai-test-key");
  const sent = JSON.parse(String(calls[0].init?.body));
  assert.equal(sent.model, "gpt-5-mini");
  assert.deepEqual(sent.response_format, { type: "json_schema", json_schema: { name: "thing", strict: true, schema: { type: "object" } } });
  assert.deepEqual(
    sent.messages.map((m: { role: string }) => m.role),
    ["system", "user"],
  );
  assert.deepEqual(out, { value: { ok: true }, usage: { input: 12, output: 3 } });
});

test("openai: an error status or a refusal throws", async () => {
  const req = { system: "", user: "", name: "n", schema: {} };
  await assert.rejects(openAiClient("k", "m", fakeFetch({}, 500).f).complete(req), /500/);
  await assert.rejects(openAiClient("k", "m", fakeFetch({ choices: [{ message: { refusal: "no" } }] }).f).complete(req), /no content/);
});
