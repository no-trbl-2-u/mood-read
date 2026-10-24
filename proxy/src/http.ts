// The scoring proxy's HTTP surface (01.2; pinned in plan/bearings.md, URL contract):
//
//   GET  /health            200 "ok"
//   POST /v1/score          {title, author, chapters}: the book's job, started or cached     -> JobView
//   POST /v1/rescore        {title, author, chapters}: a new run even for a cached book      -> JobView
//   GET  /v1/jobs/:jobId    the job's progress, and the scored chapters once done          -> JobView | 404
//
// The body may hold exactly title, author and chapter titles; anything else is a 400 (A22). The job id is the book's
// cache key, a hash of those three, so it names a book and never a listener. Nothing here logs a request, and the
// Worker keeps Workers Logs off (proxy/wrangler.jsonc): the proxy keeps no listener data (the privacy policy).
import type { BookRequest, JobView } from "./contract.ts";
import { bookKey, isJobId, LIMITS, parseBookRequest } from "./validate.ts";

/** What the handler needs from the job store: in production, Durable Object stubs (index.ts); in tests, in memory. */
export type Jobs = {
  start(key: string, book: BookRequest, rescore: boolean): Promise<JobView>;
  status(key: string): Promise<JobView | null>;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
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
    return json(200, await jobs().start(key, read.book, pathname === "/v1/rescore"));
  }

  const m = /^\/v1\/jobs\/([^/]+)$/.exec(pathname);
  if (request.method === "GET" && m) {
    if (!isJobId(m[1])) return json(404, { error: "no such job" });
    const v = await jobs().status(m[1]);
    return v ? json(200, v) : json(404, { error: "no such job" });
  }
  return text(404, "not found");
}
