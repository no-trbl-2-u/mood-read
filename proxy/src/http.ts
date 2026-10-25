// The scoring proxy's HTTP surface (01.2; pinned in plan/bearings.md, URL contract):
//
//   GET  /health            200 "ok"
//   POST /v1/score          {title, author, chapters, librivoxId?, gutenbergId?}: the book's job, started or cached -> JobView
//   POST /v1/rescore        the same body: a new run even for a cached book                  -> JobView
//                           once its result is old enough (RESCORE_MIN_AGE_DAYS, 7 by default; 01.21)
//   Either POST answers 429 with Retry-After when it would start a new run the limits refuse (01.21, A34): a client's
//   new runs this hour, every client's new runs this hour, or a rescore of a result still too young.
//   GET  /v1/jobs/:jobId    the job's progress, and the scored chapters once done          -> JobView | 404
//   POST /v1/verdicts       {rows: {pieceId, emotions, verdict}[]}: listeners' verdicts, counted (07.5) -> 204
//
// The body may hold exactly title, author and chapter titles, and a book from Browse's public LibriVox and Project
// Gutenberg numbers (05.9); anything else is a 400 (A22). The job id is the book's cache key, a hash of the title,
// author, chapter titles and Gutenberg number (validate.ts bookKey), so it names a book and never a listener. Nothing here logs a request, and the
// Worker keeps Workers Logs off (proxy/wrangler.jsonc): the proxy keeps no listener data (the privacy policy). The
// connection's address (cf-connecting-ip) is handed to the job only for the limiter, which keeps no more than a
// salted hash of it for the hour (limiter.ts).
//
// Verdicts (07.5, spec 07 A6): a batch holds exactly rows of a piece id, an emotion set and a verdict, anything else is
// a 400; it is rate-limited per client and per hour by 01.21's limiter in its own bucket (limiter.ts
// VERDICT_POST_LIMITS: verdict posts never count against scoring runs) and folded into counts, never kept as rows. Every job
// view the proxy answers orders each chapter's alternates by those counts (pieces.ts orderJobView).
//
// The catalog (05.3, A3): every job view the proxy answers names catalog pieces only. A result cached before v2 is
// re-matched against the bundled catalog from its stored emotions as it goes out (catalog.ts catalogJobView), with no
// new research run; its old named piece becomes the chapter's reference (D13).
import { catalogJobView } from "./catalog.ts";
import type { BookRequest, JobView, VerdictRow } from "./contract.ts";
import { retryAfterSeconds, UNKNOWN_CLIENT, type Limiter, type Refusal, type RefusalReason } from "./limiter.ts";
import { alternateIds, orderJobView } from "./pieces.ts";
import type { PieceCounts } from "./store.ts";
import { bookKey, isJobId, LIMITS, parseBookRequest, parseVerdictBatch } from "./validate.ts";

/** What the handler needs from the job store: in production, Durable Object stubs (index.ts); in tests, in memory. */
export type Jobs = {
  /** The job's view, or why no new run was started. `client` is the caller's address, for the limiter only. */
  start(key: string, book: BookRequest, rescore: boolean, client: string): Promise<JobView | { refused: Refusal }>;
  status(key: string): Promise<JobView | null>;
};

/** What the handler needs for verdicts (07.5): in production the VerdictCounts object (index.ts); in tests, in memory. */
export type Verdicts = {
  add(rows: readonly VerdictRow[]): Promise<void>;
  counts(pieceIds: readonly string[]): Promise<Record<string, PieceCounts>>;
  /** 01.21's limiter, over the verdict bucket (limiter.ts VERDICT_POST_LIMITS), never the scoring runs'. */
  limiter: Limiter;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
  "access-control-expose-headers": "retry-after",
};

const REFUSED: Record<RefusalReason, string> = {
  "rescore-too-soon": "this book was scored recently; it can be rescored later",
  "client-limit": "too many new books from this connection this hour; try again later",
  "global-limit": "scoring is busy this hour; try again later",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });

async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return { ok: false, res: json(415, { error: "send application/json" }) };
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > LIMITS.bodyBytes) return { ok: false, res: json(413, { error: "body too large" }) };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > LIMITS.bodyBytes) return { ok: false, res: json(413, { error: "body too large" }) };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, res: json(400, { error: "body is not JSON" }) };
  }
}

async function readBook(request: Request): Promise<{ ok: true; book: BookRequest } | { ok: false; res: Response }> {
  const read = await readJson(request);
  if (!read.ok) return read;
  const parsed = parseBookRequest(read.body);
  return parsed.ok ? { ok: true, book: parsed.book } : { ok: false, res: json(400, { error: parsed.error }) };
}

const VERDICT_REFUSED: Record<"client-limit" | "global-limit", string> = {
  "client-limit": "too many verdict posts from this connection this hour; try again later",
  "global-limit": "verdicts are busy this hour; try again later",
};

/** POST /v1/verdicts: limited per client and per hour (its own bucket), validated, folded into counts; 204, no body. */
async function postVerdicts(request: Request, verdicts: Verdicts): Promise<Response> {
  const admitted = await verdicts.limiter.admit(request.headers.get("cf-connecting-ip") || UNKNOWN_CLIENT, Date.now());
  if (!admitted.ok) {
    const reason = admitted.reason === "global-limit" ? "global-limit" : "client-limit";
    const seconds = retryAfterSeconds(admitted.retryAfterMs);
    const res = json(429, { error: VERDICT_REFUSED[reason], reason, retryAfterSeconds: seconds });
    res.headers.set("retry-after", String(seconds));
    return res;
  }
  const read = await readJson(request);
  if (!read.ok) return read.res;
  const parsed = parseVerdictBatch(read.body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  await verdicts.add(parsed.batch.rows);
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * A job view on the catalog (05.3) with each chapter's alternates in the listeners' order (07.5). Without verdicts, or when the counts
 * cannot be read, the view goes out as the job holds it: an ordering never stands between a listener and a score.
 */
async function ordered(raw: JobView, verdicts: (() => Verdicts) | undefined): Promise<JobView> {
  const view = catalogJobView(raw);
  if (!verdicts || !view.result) return view;
  const ids = alternateIds(view);
  if (!ids.length) return view;
  try {
    return orderJobView(view, await verdicts().counts(ids));
  } catch {
    return view;
  }
}

export async function route(request: Request, jobs: () => Jobs, verdicts?: () => Verdicts): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method === "GET" && pathname === "/health") return text(200, "ok");

  if (request.method === "POST" && (pathname === "/v1/score" || pathname === "/v1/rescore")) {
    const read = await readBook(request);
    if (!read.ok) return read.res;
    const key = await bookKey(read.book);
    const client = request.headers.get("cf-connecting-ip") || UNKNOWN_CLIENT;
    const out = await jobs().start(key, read.book, pathname === "/v1/rescore", client);
    if ("refused" in out) {
      const seconds = retryAfterSeconds(out.refused.retryAfterMs);
      const res = json(429, { error: REFUSED[out.refused.reason], reason: out.refused.reason, retryAfterSeconds: seconds });
      res.headers.set("retry-after", String(seconds));
      return res;
    }
    return json(200, await ordered(out, verdicts));
  }

  if (request.method === "POST" && pathname === "/v1/verdicts") {
    if (!verdicts) return json(503, { error: "verdicts are not configured" });
    return postVerdicts(request, verdicts());
  }

  const m = /^\/v1\/jobs\/([^/]+)$/.exec(pathname);
  if (request.method === "GET" && m) {
    if (!isJobId(m[1])) return json(404, { error: "no such job" });
    const v = await jobs().status(m[1]);
    return v ? json(200, await ordered(v, verdicts)) : json(404, { error: "no such job" });
  }
  return text(404, "not found");
}
