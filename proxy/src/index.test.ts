// The Worker end to end in node: the real handler, the two Durable Object classes over in-memory storage with their
// alarms fired by hand, and the real OpenAI and Brave clients talking to a stubbed fetch. Nothing reaches the network.
// 07.5 adds the VerdictCounts object over the same in-memory storage.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { BRAVE_ENDPOINT, OPENAI_ENDPOINT } from "./clients.ts";
import type { JobView } from "./contract.ts";
import { defaultHits, fakeModel } from "./fakes.ts";
import worker, { BookJob, RateLimiter, SpendMeter, VerdictCounts, type DoNamespace, type DoState, type DoStorage, type Env } from "./index.ts";
import { memoryStore } from "./store.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = "https://mood-read-proxy.example.workers.dev";

function storage(): DoStorage & { alarm: number | null; keys(): string[] } {
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

type Ns = ReturnType<typeof namespace>;

function makeEnv(over: Partial<Env> = {}): Env & { BOOK_JOBS: Ns; SPEND_METER: Ns; RATE_LIMITER: Ns } {
  const env = { OPENAI_API_KEY: "test-openai", BRAVE_SEARCH_API_KEY: "test-brave", MONTHLY_CAP_USD: "20", ...over } as Env & {
    BOOK_JOBS: Ns;
    SPEND_METER: Ns;
    RATE_LIMITER: Ns;
  };
  env.BOOK_JOBS = namespace((state) => new BookJob(state, env));
  env.SPEND_METER = namespace((state) => new SpendMeter(state, env));
  env.RATE_LIMITER = namespace((state) => new RateLimiter(state, env));
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
const post = (p: string, body: unknown, ip?: string) =>
  new Request(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json", ...(ip ? { "cf-connecting-ip": ip } : {}) }, body: JSON.stringify(body) });

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

test("through the Worker: a client's fourth made-up book this hour is a 429, others still score, nothing kept names the address (A34)", async () => {
  const env = makeEnv();
  const made = (n: number) => ({ ...book, title: `Made Up ${n}` });
  for (let n = 1; n <= 3; n++) assert.equal((await worker.fetch(post("/v1/score", made(n), "203.0.113.7"), env)).status, 200);
  const calls = outbound.length;
  const over = await worker.fetch(post("/v1/score", made(4), "203.0.113.7"), env);
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers.get("retry-after")) >= 1);
  assert.equal(outbound.length, calls, "a refused book costs nothing");
  assert.equal((await worker.fetch(post("/v1/score", made(4), "198.51.100.2"), env)).status, 200, "another client may");

  const limiter = env.RATE_LIMITER.objects.get("rate-limiter")!;
  assert.notEqual(limiter.storage.alarm, null, "the hour's window is set to be deleted when it ends");
  const kept = JSON.stringify(await limiter.storage.get("window"));
  for (const ip of ["203.0.113.7", "198.51.100.2"]) assert.ok(!kept.includes(ip), "only salted hashes are kept");
  for (const obj of env.BOOK_JOBS.objects.values()) {
    for (const k of obj.storage.keys()) assert.ok(!JSON.stringify(await obj.storage.get(k)).includes("203.0.113.7"), "a book's job keeps no address");
  }

  // The window's alarm deletes it once the hour is over.
  const now = Date.now;
  Date.now = () => now() + 2 * 3_600_000;
  try {
    limiter.storage.alarm = null;
    await limiter.instance.alarm!();
  } finally {
    Date.now = now;
  }
  assert.deepEqual(limiter.storage.keys(), []);
});

test("through the Worker: a cached book is served to a client past its limit, and an early rescore is a 429 (A34)", async () => {
  const env = makeEnv({ RUNS_PER_CLIENT_PER_HOUR: "1" });
  const started = (await (await worker.fetch(post("/v1/score", book, "203.0.113.7"), env)).json()) as JobView;
  await runAlarms(env, started.jobId);
  const again = await worker.fetch(post("/v1/score", book, "203.0.113.7"), env);
  assert.equal(again.status, 200);
  assert.equal(((await again.json()) as JobView).state, "done");
  const re = await worker.fetch(post("/v1/rescore", book, "198.51.100.2"), env);
  assert.equal(re.status, 429);
  assert.equal(((await re.json()) as { reason: string }).reason, "rescore-too-soon");
});

test("the limits are config values: a global ceiling of new runs an hour across every client (A34)", async () => {
  const env = makeEnv({ RUNS_PER_HOUR: "2" });
  const made = (n: number) => ({ ...book, title: `Made Up ${n}` });
  assert.equal((await worker.fetch(post("/v1/score", made(1), "10.0.0.1"), env)).status, 200);
  assert.equal((await worker.fetch(post("/v1/score", made(2), "10.0.0.2"), env)).status, 200);
  const over = await worker.fetch(post("/v1/score", made(3), "10.0.0.3"), env);
  assert.equal(over.status, 429);
  assert.equal(((await over.json()) as { reason: string }).reason, "global-limit");
});

test("verdicts through the Worker: counted in the VerdictCounts object, no key needed, and the next job view is ordered by them (07.5)", async () => {
  const env = makeEnv({ OPENAI_API_KEY: undefined, BRAVE_SEARCH_API_KEY: undefined });
  const verdictsNs = namespace((state) => new VerdictCounts(state, env));
  env.VERDICTS = verdictsNs;
  const row = { pieceId: "composer-2--theme-1-1-2", emotions: ["tension", "dread"], verdict: "fits" };
  const res = await worker.fetch(post("/v1/verdicts", { rows: [row, row] }), env);
  assert.equal(res.status, 204);
  const obj = verdictsNs.objects.get("verdicts")!;
  assert.deepEqual(obj.storage.keys(), [`verdicts:${row.pieceId}`], "counts only, one record per piece");
  assert.deepEqual(await obj.storage.get(`verdicts:${row.pieceId}`), { "tension,dread": { fits: 2, misfits: 0 } });
  assert.equal((await worker.fetch(post("/v1/verdicts", { rows: [{ ...row, bookId: "x" }] }), env)).status, 400);
  assert.equal(outbound.length, 0, "a verdict reaches no other service");

  // 01.21's limiter, in the verdict bucket: past ten posts an hour, a client waits.
  const from = () => new Request(`${BASE}/v1/verdicts`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "7.7.7.7" }, body: JSON.stringify({ rows: [row] }) });
  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) statuses.push((await worker.fetch(from(), env)).status);
  assert.ok(statuses.includes(204) && statuses.at(-1) === 429, statuses.join(","));
});

test("a scored book's job view through the Worker orders alternates by the counts", async () => {
  const env = makeEnv();
  env.VERDICTS = namespace((state) => new VerdictCounts(state, env));
  const started = (await (await worker.fetch(post("/v1/score", book), env)).json()) as JobView;
  await runAlarms(env, started.jobId);
  const done = (await (await worker.fetch(new Request(`${BASE}/v1/jobs/${started.jobId}`), env)).json()) as JobView;
  const c0 = done.result!.chapters[0];
  const emotions = c0.mood.emotions.map((e) => e.emotion);
  const last = c0.pieces!.alternates.at(-1)!;
  const rows = Array.from({ length: 3 }, () => ({ pieceId: last.id, emotions, verdict: "fits" }));
  assert.equal((await worker.fetch(post("/v1/verdicts", { rows }), env)).status, 204);
  const after = (await (await worker.fetch(new Request(`${BASE}/v1/jobs/${started.jobId}`), env)).json()) as JobView;
  assert.equal(after.result!.chapters[0].pieces!.alternates[0].id, last.id);
});

test("without the VERDICTS binding, POST /v1/verdicts is a 503", async () => {
  const env = makeEnv();
  assert.equal((await worker.fetch(post("/v1/verdicts", { rows: [] }), env)).status, 503);
});

test("verdict posts use 01.21's limiter in a bucket of their own: they never eat into scoring runs, nor runs into them (07.5)", async () => {
  const env = makeEnv({ RUNS_PER_CLIENT_PER_HOUR: "1" });
  env.VERDICTS = namespace((state) => new VerdictCounts(state, env));
  const row = { pieceId: "a--b", emotions: ["dread"], verdict: "fits" };
  for (let i = 0; i < 5; i++) assert.equal((await worker.fetch(post("/v1/verdicts", { rows: [row] }, "203.0.113.9"), env)).status, 204);
  assert.equal((await worker.fetch(post("/v1/score", { ...book, title: "Made Up 1" }, "203.0.113.9"), env)).status, 200, "the run is still allowed");
  assert.equal((await worker.fetch(post("/v1/score", { ...book, title: "Made Up 2" }, "203.0.113.9"), env)).status, 429, "the run limit is its own");
  assert.equal((await worker.fetch(post("/v1/verdicts", { rows: [row] }, "203.0.113.9"), env)).status, 204, "verdicts still go");

  const verdictWindow = env.RATE_LIMITER.objects.get("verdict-limiter")!;
  const runWindow = env.RATE_LIMITER.objects.get("rate-limiter")!;
  assert.equal(((await verdictWindow.storage.get("window")) as { total: number }).total, 6);
  assert.equal(((await runWindow.storage.get("window")) as { total: number }).total, 1);
  assert.ok(!JSON.stringify(await verdictWindow.storage.get("window")).includes("203.0.113.9"), "only salted hashes are kept");
  assert.notEqual(verdictWindow.storage.alarm, null, "the verdict window is deleted when its hour ends, too");

  // Past its own limit a client's verdict post is a 429 with Retry-After.
  for (let i = 0; i < 4; i++) await worker.fetch(post("/v1/verdicts", { rows: [row] }, "203.0.113.9"), env);
  const over = await worker.fetch(post("/v1/verdicts", { rows: [row] }, "203.0.113.9"), env);
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers.get("retry-after")) >= 1);
  assert.equal(((await over.json()) as { reason: string }).reason, "client-limit");
});
