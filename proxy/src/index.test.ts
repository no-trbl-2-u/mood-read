// The Worker end to end in node: the real handler, the two Durable Object classes over in-memory storage with their
// alarms fired by hand, and the real OpenAI and Brave clients talking to a stubbed fetch. Nothing reaches the network.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { BRAVE_ENDPOINT, OPENAI_ENDPOINT } from "./clients.ts";
import type { JobView } from "./contract.ts";
import { defaultHits, fakeModel } from "./fakes.ts";
import worker, { BookJob, SpendMeter, type DoNamespace, type DoState, type DoStorage, type Env } from "./index.ts";
import { memoryStore } from "./store.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = "https://mood-read-proxy.example.workers.dev";

function storage(): DoStorage & { alarm: number | null } {
  const s = memoryStore();
  const st = {
    ...s,
    alarm: null as number | null,
    async getAlarm() {
      return st.alarm;
    },
    async setAlarm(at: number) {
      st.alarm = at;
    },
  };
  return st;
}

type Obj = { instance: { fetch(r: Request): Promise<Response>; alarm?: () => Promise<void> }; storage: ReturnType<typeof storage> };

function namespace(make: (state: DoState) => Obj["instance"]): DoNamespace & { objects: Map<string, Obj> } {
  const objects = new Map<string, Obj>();
  return {
    objects,
    idFromName: (name: string) => name,
    get(id: unknown) {
      const name = String(id);
      if (!objects.has(name)) {
        const st = storage();
        objects.set(name, { instance: make({ storage: st }), storage: st });
      }
      const obj = objects.get(name)!;
      return { fetch: (input: string, init?: RequestInit) => obj.instance.fetch(new Request(input, init)) };
    },
  };
}

function makeEnv(over: Partial<Env> = {}): Env & { BOOK_JOBS: ReturnType<typeof namespace>; SPEND_METER: ReturnType<typeof namespace> } {
  const env = { OPENAI_API_KEY: "test-openai", BRAVE_SEARCH_API_KEY: "test-brave", MONTHLY_CAP_USD: "20", ...over } as Env & {
    BOOK_JOBS: ReturnType<typeof namespace>;
    SPEND_METER: ReturnType<typeof namespace>;
  };
  env.BOOK_JOBS = namespace((state) => new BookJob(state, env));
  env.SPEND_METER = namespace((state) => new SpendMeter(state, env));
  return env;
}

const realFetch = globalThis.fetch;
let outbound: string[] = [];

beforeEach(() => {
  outbound = [];
  const model = fakeModel();
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    outbound.push(url);
    if (url.startsWith(BRAVE_ENDPOINT)) {
      const q = new URL(url).searchParams.get("q") ?? "";
      return Response.json({ web: { results: defaultHits(q).map((h) => ({ url: h.url, title: h.title, description: h.snippet })) } });
    }
    if (url === OPENAI_ENDPOINT) {
      const body = JSON.parse(String(init?.body));
      const out = await model.complete({
        system: body.messages[0].content,
        user: body.messages[1].content,
        name: body.response_format.json_schema.name,
        schema: body.response_format.json_schema.schema,
      });
      return Response.json({ choices: [{ message: { content: JSON.stringify(out.value) } }], usage: { prompt_tokens: 500, completion_tokens: 100 } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const book = { title: "Dracula", author: "Bram Stoker", chapters: ["Chapter 1", "Chapter 2", "Chapter 3"] };
const post = (p: string, body: unknown) => new Request(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function runAlarms(env: ReturnType<typeof makeEnv>, key: string) {
  const obj = env.BOOK_JOBS.objects.get(key)!;
  for (let i = 0; i < 100 && obj.storage.alarm !== null; i++) {
    obj.storage.alarm = null;
    await obj.instance.alarm!();
  }
}

test("GET /health needs no bindings", async () => {
  const res = await worker.fetch(new Request(`${BASE}/health`));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ok");
});

test("score through the Worker: the job runs on the book's object's alarms, is metered, and is cached for the next listener", async () => {
  const env = makeEnv();
  const started = (await (await worker.fetch(post("/v1/score", book), env)).json()) as JobView;
  assert.equal(started.state, "running");
  const obj = env.BOOK_JOBS.objects.get(started.jobId)!;
  assert.notEqual(obj.storage.alarm, null, "the first step is scheduled");

  await runAlarms(env, started.jobId);
  const done = (await (await worker.fetch(new Request(`${BASE}/v1/jobs/${started.jobId}`), env)).json()) as JobView;
  assert.equal(done.state, "done");
  assert.equal(done.result?.chapters.length, 3);
  assert.ok(done.result!.chapters.every((c) => c.pieces && c.pieces.alternates.length >= 2));

  const meter = env.SPEND_METER.objects.get("spend-meter")!;
  const month = new Date().toISOString().slice(0, 7);
  assert.ok(((await meter.storage.get<number>(`spend:${month}`)) ?? 0) > 0, "the meter object holds the month's spend");

  const calls = outbound.length;
  const again = (await (await worker.fetch(post("/v1/score", book), env)).json()) as JobView;
  assert.equal(again.state, "done");
  assert.equal(outbound.length, calls, "a cached book costs nothing");
  assert.ok(outbound.every((u) => u.startsWith(BRAVE_ENDPOINT) || u === OPENAI_ENDPOINT), "the proxy calls only Brave and OpenAI");
});

test("at the cap the Worker starts no run and schedules nothing", async () => {
  const env = makeEnv({ MONTHLY_CAP_USD: "0" });
  const v = (await (await worker.fetch(post("/v1/score", book), env)).json()) as JobView;
  assert.equal(v.state, "capped");
  assert.equal(env.BOOK_JOBS.objects.get(v.jobId)!.storage.alarm, null);
  assert.equal(outbound.length, 0);
});

test("without its keys the Worker refuses to score (503) rather than run blind", async () => {
  const env = makeEnv({ OPENAI_API_KEY: undefined });
  assert.equal((await worker.fetch(post("/v1/score", book), env)).status, 503);
});

test("the proxy's code logs nothing (the privacy policy: no listener data kept)", () => {
  for (const f of fs.readdirSync(HERE).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
    assert.doesNotMatch(fs.readFileSync(path.join(HERE, f), "utf8"), /\bconsole\.\w+\(/, f);
  }
});
