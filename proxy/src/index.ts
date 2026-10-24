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
// alarms to drive a long job, and no atomic add for the meter.
import { braveClient, openAiClient } from "./clients.ts";
import type { BookRequest, JobView } from "./contract.ts";
import { route, type Jobs } from "./http.ts";
import { createBookJob } from "./job.ts";
import { capFrom, createMeter, type Meter } from "./meter.ts";
import type { Store } from "./store.ts";
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
};

const METER_NAME = "spend-meter";

/** The meter, reached in its own object. */
function remoteMeter(env: Env): Meter {
  const stub = () => env.SPEND_METER.get(env.SPEND_METER.idFromName(METER_NAME));
  return {
    async spent(month) {
      const res = await stub().fetch(`https://meter/spent?month=${encodeURIComponent(month)}`);
      return ((await res.json()) as { usd: number }).usd;
    },
    async add(month, usd) {
      await stub().fetch("https://meter/add", { method: "POST", body: JSON.stringify({ month, usd }) });
    },
  };
}

function bookJobs(env: Env): Jobs {
  const stub = (key: string) => env.BOOK_JOBS.get(env.BOOK_JOBS.idFromName(key));
  return {
    async start(key: string, book: BookRequest, rescore: boolean) {
      const res = await stub(key).fetch("https://book/start", { method: "POST", body: JSON.stringify({ key, book, rescore }) });
      return (await res.json()) as JobView;
    },
    async status(key: string) {
      const res = await stub(key).fetch("https://book/status");
      return res.status === 404 ? null : ((await res.json()) as JobView);
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
    });
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const job = this.job();
    if (pathname === "/start") {
      const { key, book, rescore } = (await request.json()) as { key: string; book: BookRequest; rescore: boolean };
      const out = await job.start(key, book, rescore);
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
      const { month, usd } = (await request.json()) as { month: string; usd: number };
      await meter.add(month, usd);
      return new Response(null, { status: 204 });
    }
    return Response.json({ usd: await meter.spent(url.searchParams.get("month") ?? "") });
  }
}

export async function handle(request: Request, env?: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/v1/") && (!env || (request.method === "POST" && !configured(env)))) {
    return new Response(JSON.stringify({ error: "scoring is not configured" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
    });
  }
  return route(request, () => bookJobs(env as Env));
}

const worker = {
  fetch(request: Request, env?: Env): Promise<Response> {
    return handle(request, env);
  },
};

export default worker;
