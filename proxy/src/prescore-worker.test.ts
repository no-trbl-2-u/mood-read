// Pre-scoring through the Worker (05.10, A11): the real handler and Durable Object classes over in-memory storage,
// alarms fired by hand, and the real OpenAI and Brave clients talking to a stubbed fetch. Nothing reaches the network.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { BRAVE_ENDPOINT, OPENAI_ENDPOINT } from "./clients.ts";
import { defaultHits, fakeModel } from "./fakes.ts";
import worker, { BookJob, PrescoreIndex, RateLimiter, SpendMeter, type DoNamespace, type DoState, type DoStorage, type Env } from "./index.ts";
import { MIN_TOKEN_LENGTH, PRESCORE_BUCKET } from "./prescore.ts";
import { memoryStore } from "./store.ts";

const BASE = "https://mood-read-proxy.example.workers.dev";
const TOKEN = "o".repeat(MIN_TOKEN_LENGTH) + "wner";

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

type Ns = ReturnType<typeof namespace>;
type TestEnv = Env & { BOOK_JOBS: Ns; SPEND_METER: Ns; PRESCORED: Ns; RATE_LIMITER: Ns };

function makeEnv(over: Partial<Env> = {}): TestEnv {
  const env = { OPENAI_API_KEY: "test-openai", BRAVE_SEARCH_API_KEY: "test-brave", MONTHLY_CAP_USD: "20", PRESCORE_TOKEN: TOKEN, ...over } as TestEnv;
  env.BOOK_JOBS = namespace((state) => new BookJob(state, env));
  env.SPEND_METER = namespace((state) => new SpendMeter(state, env));
  env.PRESCORED = namespace((state) => new PrescoreIndex(state, env));
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

const book = { title: "Dracula", author: "Bram Stoker", chapters: ["Secret Chapter One", "Secret Chapter Two"], librivoxId: "1234" };
const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const owner = { authorization: `Bearer ${TOKEN}` };
const get = (p: string) => new Request(`${BASE}${p}`);

async function runAlarms(env: TestEnv, key: string) {
  const obj = env.BOOK_JOBS.objects.get(key)!;
  for (let i = 0; i < 100 && obj.storage.alarm !== null; i++) {
    obj.storage.alarm = null;
    await obj.instance.alarm!();
  }
}

test("pre-scoring refuses a missing or wrong token, and a Worker with no token set, and touches no book", async () => {
  for (const [env, headers] of [
    [makeEnv(), {}],
    [makeEnv(), { authorization: `Bearer ${TOKEN}x` }],
    [makeEnv(), { authorization: "Bearer " }],
    [makeEnv({ PRESCORE_TOKEN: undefined }), owner],
  ] as const) {
    const res = await worker.fetch(post("/v1/prescore", book, headers), env);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("access-control-allow-origin"), null, "no page in a browser can read it");
    assert.equal(env.BOOK_JOBS.objects.size, 0);
  }
  assert.equal(outbound.length, 0);
});

test("the app's path cannot pre-score: no flag rides on /v1/score, and no browser may send the token", async () => {
  const env = makeEnv();
  assert.equal((await worker.fetch(post("/v1/score", { ...book, prescore: true }), env)).status, 400);
  const preflight = await worker.fetch(new Request(`${BASE}/v1/prescore`, { method: "OPTIONS" }), env);
  assert.doesNotMatch(preflight.headers.get("access-control-allow-headers") ?? "", /authorization/i);
  assert.equal((await worker.fetch(post("/v1/prescore", { ...book, extra: "x" }, owner), env)).status, 400, "the owner's body is checked like a listener's");
});

test("the owner pre-scores a book: billed to pre-scoring, cached for every listener, and Browse reads its overall emotions only", async () => {
  const env = makeEnv();
  const res = await worker.fetch(post("/v1/prescore", book, owner), env);
  assert.equal(res.status, 200);
  const started = (await res.json()) as { jobId: string; state: string; budget: { halfUsd: number; open: boolean }; result?: unknown };
  assert.equal(started.state, "running");
  assert.equal(started.budget.halfUsd, 10);
  assert.equal(started.result, undefined, "the owner's answer carries no chapters");
  await runAlarms(env, started.jobId);

  const meter = env.SPEND_METER.objects.get("spend-meter")!;
  const month = new Date().toISOString().slice(0, 7);
  const pre = (await meter.storage.get<number>(`spend:${PRESCORE_BUCKET}:${month}`)) ?? 0;
  assert.ok(pre > 0);
  assert.equal(pre, await meter.storage.get<number>(`spend:${month}`));

  const objects = env.BOOK_JOBS.objects.size;
  const calls = outbound.length;
  const view = await worker.fetch(get("/v1/overall?ids=1234,999"), env);
  assert.equal(view.status, 200);
  assert.equal(view.headers.get("access-control-allow-origin"), "*");
  const body = (await view.json()) as { books: Record<string, { emotions: { emotion: string; intensity: number }[] }> };
  assert.deepEqual(Object.keys(body.books), ["1234"], "an unscored book returns nothing");
  assert.deepEqual(Object.keys(body.books["1234"]), ["emotions"]);
  assert.deepEqual(body.books["1234"].emotions.map((e) => e.emotion), ["tension", "dread"]);
  assert.doesNotMatch(JSON.stringify(body), /Secret|summaries|reviews|scenes|pieces|chapter/i, "no chapter data leaks");
  assert.equal(env.BOOK_JOBS.objects.size, objects, "reading starts no run");
  assert.equal(outbound.length, calls, "and costs nothing");

  // A listener sending the same book gets the cached result with no new run.
  const again = (await (await worker.fetch(post("/v1/score", { ...book, librivoxId: undefined }), env)).json()) as { state: string };
  assert.equal(again.state, "done");
  assert.equal(outbound.length, calls);
});

test("the owner pre-scores a book with no LibriVox number (05.22, A24): cached, no limiter, billed to pre-scoring, never in Browse", async () => {
  const env = makeEnv({ RUNS_PER_CLIENT_PER_HOUR: "0", RUNS_PER_HOUR: "0" });
  const own = { title: "My Own Audiobook", author: "Some Author", chapters: ["Secret Chapter One", "Secret Chapter Two"] };
  const res = await worker.fetch(post("/v1/prescore", own, { ...owner, "cf-connecting-ip": "203.0.113.7" }), env);
  assert.equal(res.status, 200);
  const started = (await res.json()) as { jobId: string; state: string };
  assert.equal(started.state, "running", "past the hourly limits");
  assert.equal(env.RATE_LIMITER.objects.size, 0, "the limiter is never asked");
  await runAlarms(env, started.jobId);

  const month = new Date().toISOString().slice(0, 7);
  const meter = env.SPEND_METER.objects.get("spend-meter")!.storage;
  const pre = (await meter.get<number>(`spend:${PRESCORE_BUCKET}:${month}`)) ?? 0;
  assert.ok(pre > 0, "billed to pre-scoring's half");
  assert.equal(pre, await meter.get<number>(`spend:${month}`));

  const listed = (await (await worker.fetch(get("/v1/prescored"), env)).json()) as { books: unknown[] };
  assert.deepEqual(listed.books, [], "not in Browse's index");
  const index = env.PRESCORED.objects.get("prescored")?.storage as unknown as { keys(): string[] } | undefined;
  assert.equal(index?.keys().length ?? 0, 0, "nothing was put in PrescoreIndex");

  // Already scored: the owner's rerun and a listener's ask both get the cache, with no new run and no cost.
  const calls = outbound.length;
  const rerun = (await (await worker.fetch(post("/v1/prescore", own, owner), env)).json()) as { jobId: string; state: string };
  assert.deepEqual([rerun.jobId, rerun.state], [started.jobId, "done"]);
  const listener = (await (await worker.fetch(post("/v1/score", own), env)).json()) as { state: string };
  assert.equal(listener.state, "done");
  assert.equal(outbound.length, calls);
  assert.equal(await meter.get<number>(`spend:${PRESCORE_BUCKET}:${month}`), pre);
});

test("a listener's own LibriVox book is never listed in Browse", async () => {
  const env = makeEnv();
  const started = (await (await worker.fetch(post("/v1/score", { ...book, librivoxId: "4321" }), env)).json()) as { jobId: string };
  await runAlarms(env, started.jobId);
  const body = (await (await worker.fetch(get("/v1/overall?ids=4321"), env)).json()) as { books: object };
  assert.deepEqual(body.books, {});
});

test("the overall read never starts a run, spends nothing and needs no keys", async () => {
  const env = makeEnv({ OPENAI_API_KEY: undefined, BRAVE_SEARCH_API_KEY: undefined });
  const res = await worker.fetch(get("/v1/overall?ids=1,2,3"), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { books: {} });
  assert.equal(env.BOOK_JOBS.objects.size, 0);
  assert.equal(env.SPEND_METER.objects.size, 0);
  assert.equal(outbound.length, 0);
  assert.equal((await worker.fetch(get("/v1/overall?ids=abc"), env)).status, 400);
  assert.equal((await worker.fetch(get("/v1/overall"), env)).status, 400);
});

test("once pre-scoring's half is spent the Worker answers 429 with the budget and starts nothing", async () => {
  const env = makeEnv();
  const month = new Date().toISOString().slice(0, 7);
  await env.SPEND_METER.get("spend-meter").fetch("https://meter/add", { method: "POST", body: JSON.stringify({ month, usd: 10, bucket: PRESCORE_BUCKET }) });
  const res = await worker.fetch(post("/v1/prescore", book, owner), env);
  assert.equal(res.status, 429);
  const body = (await res.json()) as { budget: { open: boolean; prescoreUsd: number; halfUsd: number } };
  assert.equal(body.budget.open, false);
  assert.equal(body.budget.prescoreUsd, 10);
  assert.equal(env.BOOK_JOBS.objects.size, 0);
  assert.equal(outbound.length, 0);

  // A listener still scores: their half is untouched.
  const mine = (await (await worker.fetch(post("/v1/score", { ...book, librivoxId: undefined }), env)).json()) as { state: string };
  assert.equal(mine.state, "running");
});

test("Browse's default list (05.20): the pre-scored books, newest first, read only, no chapter data, never a listener's", async () => {
  const env = makeEnv();
  for (const id of ["1234", "5678"]) {
    const started = (await (await worker.fetch(post("/v1/prescore", { ...book, title: `Book ${id}`, librivoxId: id }, owner), env)).json()) as { jobId: string };
    await runAlarms(env, started.jobId);
  }
  const mine = (await (await worker.fetch(post("/v1/score", { ...book, title: "My Own", librivoxId: "4321" }), env)).json()) as { jobId: string };
  await runAlarms(env, mine.jobId);

  const objects = env.BOOK_JOBS.objects.size;
  const month = new Date().toISOString().slice(0, 7);
  const meter = env.SPEND_METER.objects.get("spend-meter")!.storage;
  const spent = await meter.get<number>(`spend:${month}`);
  assert.ok(spent && spent > 0);
  const calls = outbound.length;
  const res = await worker.fetch(get("/v1/prescored"), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  const body = (await res.json()) as { books: { id: string; emotions: { emotion: string }[] }[] };
  assert.deepEqual(body.books.map((b) => b.id), ["5678", "1234"], "most recently pre-scored first; the listener's own book never");
  for (const b of body.books) assert.deepEqual(Object.keys(b).sort(), ["emotions", "id"]);
  assert.deepEqual(body.books[0].emotions.map((e) => e.emotion), ["tension", "dread"]);
  assert.doesNotMatch(JSON.stringify(body), /Secret|summaries|reviews|scenes|pieces|chapter|Book 1234|Bram/i, "no chapter or book data leaks");
  assert.deepEqual(((await (await worker.fetch(get("/v1/prescored?limit=1"), env)).json()) as typeof body).books.map((b) => b.id), ["5678"]);
  assert.equal(env.BOOK_JOBS.objects.size, objects, "listing starts no run");
  assert.equal(await meter.get<number>(`spend:${month}`), spent, "spends nothing");
  assert.equal(outbound.length, calls, "and costs nothing");
});

test("the listing needs no keys, starts nothing, and refuses an unbounded or malformed limit", async () => {
  const env = makeEnv({ OPENAI_API_KEY: undefined, BRAVE_SEARCH_API_KEY: undefined });
  const res = await worker.fetch(get("/v1/prescored?limit=50"), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { books: [] });
  for (const bad of ["0", "51", "1000", "abc"]) {
    const r = await worker.fetch(get(`/v1/prescored?limit=${bad}`), env);
    assert.equal(r.status, 400, bad);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
  }
  assert.notEqual((await worker.fetch(post("/v1/prescored", {}), env)).status, 200, "read only: no POST");
  assert.equal(env.BOOK_JOBS.objects.size, 0);
  assert.equal(env.SPEND_METER.objects.size, 0);
  assert.equal(outbound.length, 0);
});

test("the owner's pre-score runs are not counted by the run limits; a listener's new book still is (01.21, A34)", async () => {
  const env = makeEnv({ RUNS_PER_CLIENT_PER_HOUR: "0", RUNS_PER_HOUR: "0" });
  for (const n of ["1", "2", "3", "4"]) {
    const res = await worker.fetch(post("/v1/prescore", { ...book, title: `Dracula ${n}`, librivoxId: n }, { ...owner, "cf-connecting-ip": "203.0.113.7" }), env);
    assert.equal(res.status, 200, "pre-scoring has its own budget share, not the hourly limits");
    assert.equal(((await res.json()) as { state: string }).state, "running");
  }
  assert.equal(env.RATE_LIMITER.objects.size, 0, "the limiter is never asked for a pre-score run");
  const listener = await worker.fetch(post("/v1/score", { ...book, title: "Carmilla", librivoxId: undefined }, { "cf-connecting-ip": "203.0.113.7" }), env);
  assert.equal(listener.status, 429);
  assert.equal(((await listener.json()) as { reason: string }).reason, "global-limit");
});

test("a listener asking for a book being pre-scored takes the run over without counting as a new run (01.21, A34)", async () => {
  const env = makeEnv({ RUNS_PER_CLIENT_PER_HOUR: "0" });
  const started = (await (await worker.fetch(post("/v1/prescore", book, owner), env)).json()) as { jobId: string };
  const res = await worker.fetch(post("/v1/score", book, { "cf-connecting-ip": "203.0.113.7" }), env);
  assert.equal(res.status, 200, "the run already going is returned, past the client's limit");
  assert.equal(((await res.json()) as { jobId: string }).jobId, started.jobId);
  assert.equal(env.RATE_LIMITER.objects.size, 0);
});
