// Pre-scoring's HTTP surface (05.10, A11), beside the scoring routes in http.ts:
//
//   POST /v1/prescore        owner only (Authorization: Bearer <PRESCORE_TOKEN>); the same body as /v1/score, with
//                            its LibriVox number required: starts the book's pre-score run, or returns it cached
//                            -> { jobId, state, progress, budget }, or 429 { error, budget } once the half is spent
//   GET  /v1/overall?ids=1,2 public, read only: each pre-scored book's overall emotions by LibriVox number
//                            -> { books: { "<id>": { emotions } } }; never starts a run
//
// The pre-score route sends no CORS headers and the scoring routes' CORS never allows an Authorization header, so no
// page in a browser can call it; the app holds no token (agents.md rule 6, A22) and its /v1/score body cannot carry a
// pre-score flag (validate.ts refuses every unknown field).
import type { BookRequest, JobView } from "./contract.ts";
import { ownerAuthorized, parseIds, type OverallView, type PrescoreBudget } from "./prescore.ts";
import { bookKey, LIMITS, parseBookRequest } from "./validate.ts";

export type PrescoreDeps = {
  /** The Worker's PRESCORE_TOKEN secret, if set. */
  token: string | undefined;
  budget(): Promise<PrescoreBudget>;
  /** Starts (or returns) the book's job as a pre-score run. */
  start(key: string, book: BookRequest): Promise<JobView>;
  /** Reads the index; never starts a run. */
  overall(ids: string[]): Promise<OverallView>;
};

/** What POST /v1/prescore answers: the job without its chapters, and the budget. */
export type PrescoreView = Pick<JobView, "jobId" | "state" | "progress"> & { budget: PrescoreBudget };

const OVERALL_HEADERS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type" };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

async function prescore(request: Request, deps: PrescoreDeps): Promise<Response> {
  if (!ownerAuthorized(request.headers.get("authorization"), deps.token)) return json(401, { error: "pre-scoring is the owner's" });
  if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return json(415, { error: "send application/json" });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > LIMITS.bodyBytes) return json(413, { error: "body too large" });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "body is not JSON" });
  }
  const parsed = parseBookRequest(body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  if (!parsed.book.librivoxId) return json(400, { error: "a pre-scored book needs its librivoxId" });
  const budget = await deps.budget();
  // A spent half starts nothing and touches no book's job: the owner's script stops here.
  if (!budget.open) return json(429, { error: "the pre-score half of this month's cap is spent", budget });
  const v = await deps.start(await bookKey(parsed.book), parsed.book);
  return json(200, { jobId: v.jobId, state: v.state, progress: v.progress, budget: await deps.budget() } satisfies PrescoreView);
}

async function overall(url: URL, deps: PrescoreDeps): Promise<Response> {
  const ids = parseIds(url.searchParams.get("ids"));
  if (!ids.ok) return json(400, { error: ids.error }, OVERALL_HEADERS);
  return json(200, await deps.overall(ids.ids), OVERALL_HEADERS);
}

/** Answers the pre-score routes; null for any other request, which http.ts's route() then handles. */
export async function routePrescore(request: Request, deps: () => PrescoreDeps): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/v1/prescore" && request.method === "POST") return prescore(request, deps());
  if (url.pathname === "/v1/overall" && request.method === "GET") return overall(url, deps());
  return null;
}
