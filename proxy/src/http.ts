// The scoring proxy's HTTP surface (01.2; pinned in plan/bearings.md, URL contract):
//
//   GET  /health            200 "ok"
//   POST /v1/score          {title, author, chapters, librivoxId?, gutenbergId?}: the book's job, started or cached -> JobView
//   POST /v1/rescore        the same body: a new run even for a cached book                  -> JobView
//                           once its result is old enough (RESCORE_MIN_AGE_DAYS, 7 by default; 01.21)
//   Either POST answers 429 with Retry-After when it would start a new run the limits refuse (01.21, A34): a client's
//   new runs this hour, every client's new runs this hour, or a rescore of a result still too young.
//   GET  /v1/jobs/:jobId    the job's progress, and the scored chapters once done          -> JobView | 404
//
// The body may hold exactly title, author and chapter titles, and a book from Browse's public LibriVox and Project
// Gutenberg numbers (05.9); anything else is a 400 (A22). The job id is the book's cache key, a hash of the title,
// author, chapter titles and Gutenberg number (validate.ts bookKey), so it names a book and never a listener. Nothing here logs a request, and the
// Worker keeps Workers Logs off (proxy/wrangler.jsonc): the proxy keeps no listener data (the privacy policy). The
// connection's address (cf-connecting-ip) is handed to the job only for the limiter, which keeps no more than a
// salted hash of it for the hour (limiter.ts).
import type { BookRequest, JobView } from "./contract.ts";
import { retryAfterSeconds, UNKNOWN_CLIENT, type Refusal, type RefusalReason } from "./limiter.ts";
import { bookKey, isJobId, LIMITS, parseBookRequest } from "./validate.ts";

/** What the handler needs from the job store: in production, Durable Object stubs (index.ts); in tests, in memory. */
export type Jobs = {
  /** The job's view, or why no new run was started. `client` is the caller's address, for the limiter only. */
  start(key: string, book: BookRequest, rescore: boolean, client: string): Promise<JobView | { refused: Refusal }>;
  status(key: string): Promise<JobView | null>;
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

async function readBook(request: Request): Promise<{ ok: true; book: BookRequest } | { ok: false; res: Response }> {
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return { ok: false, res: json(415, { error: "send application/json" }) };
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > LIMITS.bodyBytes) return { ok: false, res: json(413, { error: "body too large" }) };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > LIMITS.bodyBytes) return { ok: false, res: json(413, { error: "body too large" }) };
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, res: json(400, { error: "body is not JSON" }) };
  }
  const parsed = parseBookRequest(body);
  return parsed.ok ? { ok: true, book: parsed.book } : { ok: false, res: json(400, { error: parsed.error }) };
}

export async function route(request: Request, jobs: () => Jobs): Promise<Response> {
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
    return json(200, out);
  }

  const m = /^\/v1\/jobs\/([^/]+)$/.exec(pathname);
  if (request.method === "GET" && m) {
    if (!isJobId(m[1])) return json(404, { error: "no such job" });
    const v = await jobs().status(m[1]);
    return v ? json(200, v) : json(404, { error: "no such job" });
  }
  return text(404, "not found");
}
