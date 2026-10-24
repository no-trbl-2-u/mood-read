// The Worker mood-read-proxy (proxy/wrangler.jsonc): the scoring proxy (01.2), the app's only server. It holds the
// OpenAI and Brave Search keys as Worker secrets, receives a book's title, author and chapter titles and nothing more,
// stops starting new research runs at the monthly cap, and caches each book's result for every listener (A22).
// The routes are in http.ts.
//
// Why Durable Objects: a book's scoring is dozens of paid calls (searches, then readings, then piece naming), far
// past what one request or ctx.waitUntil may run. Each book is its own Durable Object (named by the book's cache key)
// whose storage holds the job, its progress and the cached result, and whose alarm runs the job one step at a time,
// saving after each, so it survives eviction and retries a failed step. One more object, SpendMeter, holds the
// month's spend: a single writer, so the cap is never raced. KV was the alternative and loses on both counts: no
// alarms to drive a long job, and no atomic add for the meter. A third, PrescoreIndex (05.10), holds the pre-scored
// books' overall emotions by LibriVox number, so Browse reads a page of them in one call (prescore.ts). A fourth,
// RateLimiter, counts new runs per client and per hour (limiter.ts, 01.21, A34), also a single writer; it holds only
// the current hour's salted hashes, and its alarm deletes them when the hour ends. A fifth,
// VerdictCounts (07.5), holds the listeners' verdicts as counts per piece and emotion set, and the verdict post's
// rate limiter in its memory: one writer, so no add is lost.
import { braveClient, openAiClient } from "./clients.ts";
import type { BookRequest, JobView, VerdictRow } from "./contract.ts";
import { route, type Jobs, type Verdicts } from "./http.ts";
import { createBookJob } from "./job.ts";
import { createRateLimiter, limitsFrom, rescoreMinAgeFrom, type Limiter, type Refusal } from "./limiter.ts";
import { memoryLimiter, type Limiter as VerdictLimiter } from "./limit.ts";
import { capFrom, createMeter, type Meter } from "./meter.ts";
import { createOverallIndex, overallEmotions, prescoreBudget, type IndexPut, type OverallView, type PrescoredList } from "./prescore.ts";
import { routePrescore, type PrescoreDeps } from "./prescore-http.ts";
import { createVerdictCounts, type PieceCounts, type Store } from "./store.ts";
import { gutenbergSource } from "./text-research.ts";

export const DEFAULT_MODEL = "gpt-5-mini";

// The few Cloudflare runtime shapes used here, declared locally so the repo needs no workers types package.
export type DoStorage = Store & { getAlarm(): Promise<number | null>; setAlarm(at: number): Promise<void> };
export type DoState = { storage: DoStorage };
export type DoStub = { fetch(input: string, init?: RequestInit): Promise<Response> };
export type DoNamespace = { idFromName(name: string): unknown; get(id: unknown): DoStub };

export type Env = {
  BOOK_JOBS: DoNamespace;
  SPEND_METER: DoNamespace;
  OPENAI_API_KEY?: string;
  BRAVE_SEARCH_API_KEY?: string;
  /** The monthly cap in US dollars; one config value (Open questions 6). */
  MONTHLY_CAP_USD?: string;
  OPENAI_MODEL?: string;
  /** The pre-scored books' index (05.10). */
  PRESCORED?: DoNamespace;
  /** The owner's pre-scoring secret (05.10): a Worker secret only, never in the app. Unset, nobody may pre-score. */
  PRESCORE_TOKEN?: string;
  RATE_LIMITER: DoNamespace;
  /** New research runs one client may start an hour (default 3). */
  RUNS_PER_CLIENT_PER_HOUR?: string;
  /** New research runs every client together may start an hour (default 30). */
  RUNS_PER_HOUR?: string;
  /** Days a cached result must age before a rescore may replace it (default 7). */
  RESCORE_MIN_AGE_DAYS?: string;
  /** The listeners' verdict counts (07.5). Unset, POST /v1/verdicts answers 503 and job views keep the scorer's order. */
  VERDICTS?: DoNamespace;
};

const METER_NAME = "spend-meter";
const INDEX_NAME = "prescored";
const VERDICTS_NAME = "verdicts";

/** The verdict counts and their limiter, reached in their own object (07.5). */
function remoteVerdicts(ns: DoNamespace): Verdicts {
  const stub = () => ns.get(ns.idFromName(VERDICTS_NAME));
  return {
    async add(rows) {
      await stub().fetch("https://verdicts/add", { method: "POST", body: JSON.stringify(rows) });
    },
    async counts(pieceIds) {
      const res = await stub().fetch("https://verdicts/counts", { method: "POST", body: JSON.stringify(pieceIds) });
      return (await res.json()) as Record<string, PieceCounts>;
    },
    limiter: {
      async take(client) {
        const res = await stub().fetch("https://verdicts/take", { method: "POST", body: JSON.stringify({ client }) });
        return ((await res.json()) as { ok: boolean }).ok;
      },
    },
  };
}

const verdictsOf = (env: Env | undefined) => (env?.VERDICTS ? () => remoteVerdicts(env.VERDICTS as DoNamespace) : undefined);

/** The meter, reached in its own object. */
function remoteMeter(env: Env): Meter {
  const stub = () => env.SPEND_METER.get(env.SPEND_METER.idFromName(METER_NAME));
  return {
    async spent(month, bucket) {
      const q = `month=${encodeURIComponent(month)}${bucket ? `&bucket=${encodeURIComponent(bucket)}` : ""}`;
      const res = await stub().fetch(`https://meter/spent?${q}`);
      return ((await res.json()) as { usd: number }).usd;
    },
    async add(month, usd, bucket) {
      await stub().fetch("https://meter/add", { method: "POST", body: JSON.stringify({ month, usd, bucket }) });
    },
  };
}

const LIMITER_NAME = "rate-limiter";

/** The limiter, reached in its own object. The client's address travels in the request and is hashed there. */
function remoteLimiter(env: Env): Limiter {
  return {
    async admit(client, nowMs) {
      const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(LIMITER_NAME));
      const res = await stub.fetch("https://limiter/admit", { method: "POST", body: JSON.stringify({ client, now: nowMs }) });
      return (await res.json()) as Awaited<ReturnType<Limiter["admit"]>>;
    },
  };
}

function bookJobs(env: Env): Jobs {
  const stub = (key: string) => env.BOOK_JOBS.get(env.BOOK_JOBS.idFromName(key));
  return {
    async start(key: string, book: BookRequest, rescore: boolean, client: string) {
      const res = await stub(key).fetch("https://book/start", { method: "POST", body: JSON.stringify({ key, book, rescore, client }) });
      if (res.status === 429) return { refused: (await res.json()) as Refusal };
      return (await res.json()) as JobView;
    },
    async status(key: string) {
      const res = await stub(key).fetch("https://book/status");
      return res.status === 404 ? null : ((await res.json()) as JobView);
    },
  };
}

/** The pre-scored books' index, reached in its own object. */
function indexStub(env: Env): DoStub | null {
  return env.PRESCORED ? env.PRESCORED.get(env.PRESCORED.idFromName(INDEX_NAME)) : null;
}

function prescoreDeps(env: Env): PrescoreDeps {
  return {
    token: env.PRESCORE_TOKEN,
    budget: () => prescoreBudget(remoteMeter(env), capFrom(env.MONTHLY_CAP_USD), Date.now()),
    async start(key, book) {
      const stub = env.BOOK_JOBS.get(env.BOOK_JOBS.idFromName(key));
      const res = await stub.fetch("https://book/start", { method: "POST", body: JSON.stringify({ key, book, rescore: false, prescore: true }) });
      return (await res.json()) as JobView;
    },
    async overall(ids) {
      const stub = indexStub(env);
      if (!stub) return { books: {} };
      const res = await stub.fetch(`https://index/get?ids=${ids.join(",")}`);
      return (await res.json()) as OverallView;
    },
    async list(limit) {
      const stub = indexStub(env);
      if (!stub) return { books: [] };
      const res = await stub.fetch(`https://index/list?limit=${limit}`);
      return (await res.json()) as PrescoredList;
    },
  };
}

const configured = (env: Env) => !!env.OPENAI_API_KEY && !!env.BRAVE_SEARCH_API_KEY;

/** One book's job: its storage is the store, its alarm the step. */
export class BookJob {
  state: DoState;
  env: Env;
  /** A public-domain book's text, held in this object's memory for its run only, never in its storage (05.9, A10). */
  text = gutenbergSource();

  constructor(state: DoState, env: Env) {
    this.state = state;
    this.env = env;
  }

  job() {
    return createBookJob({
      store: this.state.storage,
      meter: remoteMeter(this.env),
      capUsd: capFrom(this.env.MONTHLY_CAP_USD),
      search: braveClient(this.env.BRAVE_SEARCH_API_KEY ?? ""),
      model: openAiClient(this.env.OPENAI_API_KEY ?? "", this.env.OPENAI_MODEL || DEFAULT_MODEL),
      text: this.text,
      onFinish: async (done, result) => {
        const stub = indexStub(this.env);
        if (!stub || !done.book.librivoxId) return;
        const put: IndexPut = { librivoxId: done.book.librivoxId, key: done.key, emotions: overallEmotions(result), prescore: done.prescore };
        await stub.fetch("https://index/put", { method: "POST", body: JSON.stringify(put) });
      },
      limiter: remoteLimiter(this.env),
      rescoreMinAgeMs: rescoreMinAgeFrom(this.env.RESCORE_MIN_AGE_DAYS),
    });
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const job = this.job();
    if (pathname === "/start") {
      // `prescore` comes only from this Worker's own owner-checked route (prescore-http.ts): no client reaches an object.
      // The client is passed on to the limiter and never stored here.
      const { key, book, rescore, prescore, client } = (await request.json()) as {
        key: string;
        book: BookRequest;
        rescore: boolean;
        prescore?: boolean;
        client?: string;
      };
      const out = await job.start(key, book, rescore, { prescore: prescore === true, client });
      if ("refused" in out) return Response.json(out.refused, { status: 429 });
      if (out.run) await this.state.storage.setAlarm(Date.now());
      return Response.json(out.view);
    }
    const out = await job.status();
    // A capped job that may start now, or a running one whose alarm is somehow gone, is set going again.
    if (out.run || (out.view?.state === "running" && (await this.state.storage.getAlarm()) === null)) {
      await this.state.storage.setAlarm(Date.now());
    }
    return out.view ? Response.json(out.view) : new Response("no such job", { status: 404 });
  }

  async alarm(): Promise<void> {
    const { more, delayMs } = await this.job().step();
    if (more) await this.state.storage.setAlarm(Date.now() + delayMs);
  }
}

/** The month's spend, in one object so every add is serialized. */
export class SpendMeter {
  state: DoState;

  constructor(state: DoState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const meter = createMeter(this.state.storage);
    if (url.pathname === "/add") {
      const { month, usd, bucket } = (await request.json()) as { month: string; usd: number; bucket?: string };
      await meter.add(month, usd, bucket || undefined);
      return new Response(null, { status: 204 });
    }
    return Response.json({ usd: await meter.spent(url.searchParams.get("month") ?? "", url.searchParams.get("bucket") || undefined) });
  }
}

/** The pre-scored books' overall emotions (05.10), in one object so Browse reads a page of them in one call. */
export class PrescoreIndex {
  state: DoState;

  constructor(state: DoState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const index = createOverallIndex(this.state.storage);
    if (url.pathname === "/put") {
      await index.put((await request.json()) as IndexPut);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/list") return Response.json(await index.list(Number(url.searchParams.get("limit"))));
    return Response.json(await index.get((url.searchParams.get("ids") ?? "").split(",")));
  }
}

/** New runs per client and per hour, in one object so every count is serialized (limiter.ts). */
export class RateLimiter {
  state: DoState;
  env: Env;

  constructor(state: DoState, env: Env) {
    this.state = state;
    this.env = env;
  }

  limiter() {
    return createRateLimiter(this.state.storage, limitsFrom(this.env));
  }

  async fetch(request: Request): Promise<Response> {
    const { client, now } = (await request.json()) as { client: string; now?: number };
    const at = typeof now === "number" ? now : Date.now();
    const limiter = this.limiter();
    const out = await limiter.admit(client, at);
    // The hour's window (its salt and hashes) is deleted when the hour ends, whether or not another request comes.
    if (out.ok && (await this.state.storage.getAlarm()) === null) await this.state.storage.setAlarm(limiter.windowEnd(at));
    return Response.json(out);
  }

  async alarm(): Promise<void> {
    await this.limiter().expire(Date.now());
  }
}

/**
 * The listeners' verdicts as counts (07.5, spec 07 A6), in one object so every add is serialized. Its storage holds
 * counts per (piece, emotion set) and nothing else; the verdict post's rate limiter lives in its memory only.
 */
export class VerdictCounts {
  state: DoState;
  limiter: VerdictLimiter = memoryLimiter();

  constructor(state: DoState, _env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const counts = createVerdictCounts(this.state.storage);
    if (pathname === "/take") {
      const { client } = (await request.json()) as { client: string };
      return Response.json({ ok: await this.limiter.take(client) });
    }
    if (pathname === "/add") {
      await counts.add((await request.json()) as VerdictRow[]);
      return new Response(null, { status: 204 });
    }
    return Response.json(await counts.counts((await request.json()) as string[]));
  }
}

export async function handle(request: Request, env?: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  // Verdicts need no AI or search key, only their own object (route answers 503 without it).
  if (pathname === "/v1/verdicts") return route(request, () => bookJobs(env as Env), verdictsOf(env));
  if (pathname.startsWith("/v1/") && (!env || (request.method === "POST" && !configured(env)))) {
    return new Response(JSON.stringify({ error: "scoring is not configured" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
    });
  }
  return (await routePrescore(request, () => prescoreDeps(env as Env))) ?? route(request, () => bookJobs(env as Env), verdictsOf(env));
}

const worker = {
  fetch(request: Request, env?: Env): Promise<Response> {
    return handle(request, env);
  },
};

export default worker;
