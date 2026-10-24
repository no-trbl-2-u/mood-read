// The app's side of the scoring proxy (01.2): the only request Mood Read makes about a book. It sends the book's
// title, author and chapter titles, and for a LibriVox book whose text is on Project Gutenberg its public LibriVox
// and Gutenberg catalog numbers (05.9), and nothing more (agents.md rule 6): never audio. One configured base URL, no
// key (A22). A 429 is the proxy's "try later" and comes back as such (01.25, A38). Pure: `fetch` is handed in, so
// tests run it against a fake proxy. The one other request (07.5, spec 07 A6) is the listener's verdicts as aggregate
// rows (src/lib/verdict-sync.ts builds them): a piece id, an emotion set and a verdict each, never a book, chapter,
// device or time, with no header but the content type.
import { EMOTIONS, MAX_SCENES, type Book, type BusyReason, type JobView, type RemoteChapter, type ResearchCoverage, type Scene, type VerdictBatch, type VerdictRow } from "./types.ts";

export type ScoringRequest = { title: string; author: string; chapters: string[]; librivoxId?: string; gutenbergId?: string };

type Scorable = Pick<Book, "title" | "author" | "chapters"> & Partial<Pick<Book, "source">>;

/**
 * Exactly what the proxy receives about a book. A LibriVox book with a Project Gutenberg number adds both public
 * catalog numbers, so the proxy scores it from its own text (A10); an imported book, or a LibriVox book without one,
 * sends title, author and chapter titles only.
 */
export function scoringRequest(book: Scorable): ScoringRequest {
  const out: ScoringRequest = { title: book.title, author: book.author, chapters: book.chapters.map((c) => c.title) };
  const source = book.source;
  if (source?.kind === "librivox" && source.gutenbergId) {
    if (source.catalogId) out.librivoxId = source.catalogId;
    out.gutenbergId = source.gutenbergId;
  }
  return out;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const STATES = ["running", "done", "capped", "failed"];
/** The coverages a proxy answer may carry (proxy/src/contract.ts); never a listener seed (07.6). */
export const RESEARCH_COVERAGE: readonly string[] = ["scored", "too-little"] satisfies ResearchCoverage[];

const inSet = (e: { emotion?: unknown }) => (EMOTIONS as readonly string[]).includes(e?.emotion as string);

/**
 * A chapter's scenes as the device keeps them (07.1): 1 to MAX_SCENES, each with emotions and a positive span, spans
 * summing to 1, rebuilt from emotions and span alone so no text rides along. Anything else is dropped, and the
 * chapter reads as one scene (src/lib/scenes.ts); an emotion outside the fixed set is refused like the chapter's.
 */
function readScenes(raw: unknown): Scene[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SCENES) return undefined;
  const out: Scene[] = [];
  for (const s of raw) {
    const r = s as { emotions?: unknown; span?: unknown };
    if (!Array.isArray(r?.emotions) || !r.emotions.length || typeof r.span !== "number" || !Number.isFinite(r.span) || r.span <= 0) return undefined;
    if (r.emotions.some((e) => !inSet(e))) throw new Error("an emotion outside the fixed set");
    out.push({ emotions: r.emotions.map((e: Scene["emotions"][number]) => ({ emotion: e.emotion, intensity: e.intensity })), span: r.span });
  }
  return Math.abs(out.reduce((t, x) => t + x.span, 0) - 1) < 1e-6 ? out : undefined;
}

/** A chapter with its scenes and scene pieces read (or dropped), and every piece checked for vocals (A20). */
function readChapter(c: RemoteChapter): RemoteChapter {
  const { scenes: rawScenes, ...mood } = c.mood;
  const scenes = rawScenes === undefined ? undefined : readScenes(rawScenes);
  const out: RemoteChapter = { ...c, mood: scenes ? { ...mood, scenes } : mood };
  if (c.pieces) {
    const { scenePieces, ...pieces } = c.pieces;
    if ([pieces.piece, ...pieces.alternates, ...(Array.isArray(scenePieces) ? scenePieces : [])].some((p2) => p2?.vocals !== "none")) throw new Error("a piece with vocals");
    out.pieces = scenes && Array.isArray(scenePieces) && scenePieces.length === scenes.length ? { ...pieces, scenePieces } : pieces;
  }
  return out;
}

/** Checks a proxy answer's shape; anything off is an error rather than a half-read result. */
export function readJobView(body: unknown): JobView {
  const v = body as JobView;
  if (!v || typeof v.jobId !== "string" || !/^[0-9a-f]{64}$/.test(v.jobId) || !STATES.includes(v.state)) throw new Error("unexpected answer from the scoring proxy");
  const p = v.progress ?? ({} as JobView["progress"]);
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);
  const out: JobView = { jobId: v.jobId, state: v.state, progress: { step: num(p.step), steps: num(p.steps), chaptersDone: num(p.chaptersDone), chapters: num(p.chapters) } };
  if (v.state === "done" && !v.result) throw new Error("a finished job came back without its chapters");
  // A rescore running, capped or failed carries the cached result alongside; it is checked the same way.
  if (v.result !== undefined) {
    if (!v.result || !Array.isArray(v.result.chapters)) throw new Error("a job came back without its chapters");
    const chapters: RemoteChapter[] = [];
    for (const c of v.result.chapters) {
      if (typeof c?.index !== "number" || !c.mood || !Array.isArray(c.mood.emotions)) throw new Error("a chapter came back malformed");
      if (c.mood.emotions.some((e) => !inSet(e))) throw new Error("an emotion outside the fixed set");
      // Only the research's coverages: a listener's seed (07.6) is the device's own and never comes from the proxy.
      if (!RESEARCH_COVERAGE.includes(c.mood.coverage)) throw new Error("a chapter came back with a coverage the proxy never sends");
      chapters.push(readChapter(c));
    }
    out.result = { ...v.result, chapters };
  }
  return out;
}

/** The reasons a 429 names (proxy/src/limiter.ts RefusalReason; held in step by scoring-contract.test.ts). */
export const BUSY_REASONS: readonly BusyReason[] = ["client-limit", "global-limit", "rescore-too-soon"];

/** How long a 429 that names no usable wait asks the app to hold off: the proxy's limits run by the hour. */
export const DEFAULT_RETRY_SECONDS = 3600;

/**
 * The proxy's "try later" (01.21, 01.25, A38): it answered 429 because a limit refuses a new run now. Not a failure:
 * the proxy was reached and said when it will take the book.
 */
export type TryLater = { tryLater: true; reason: BusyReason; retryAfterSeconds: number };

/** A Retry-After value in whole seconds: delta-seconds, or an HTTP date counted from `now`; null when unreadable. */
function retryAfterHeader(raw: string | null, now: number): number | null {
  const v = raw?.trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : null;
}

/** Reads a 429: the reason from its body, the wait from Retry-After, else the body's retryAfterSeconds. */
async function readTryLater(res: Response, now: number): Promise<TryLater> {
  let body: { reason?: unknown; retryAfterSeconds?: unknown } = {};
  try {
    body = ((await res.json()) ?? {}) as typeof body;
  } catch {
    body = {};
  }
  const reason = BUSY_REASONS.includes(body.reason as BusyReason) ? (body.reason as BusyReason) : "global-limit";
  const fromBody = typeof body.retryAfterSeconds === "number" && Number.isFinite(body.retryAfterSeconds) && body.retryAfterSeconds >= 0 ? Math.ceil(body.retryAfterSeconds) : null;
  const retryAfterSeconds = retryAfterHeader(res.headers.get("retry-after"), now) ?? fromBody ?? DEFAULT_RETRY_SECONDS;
  return { tryLater: true, reason, retryAfterSeconds };
}

export function createScoringApi(baseUrl: string, fetchImpl: Fetch, now: () => number = Date.now) {
  const base = baseUrl.replace(/\/+$/, "");
  async function call(path: string, init?: RequestInit): Promise<JobView | TryLater | null> {
    const res = await fetchImpl(`${base}${path}`, init);
    if (res.status === 404) return null;
    if (res.status === 429) return readTryLater(res, now());
    if (!res.ok) throw new Error(`the scoring proxy answered ${res.status}`);
    return readJobView(await res.json());
  }
  return {
    /**
     * Starts scoring a book (or gets its cached result); `rescore` asks for a new run explicitly. A 429 comes back as
     * TryLater, never thrown, so it is not mistaken for an unreachable proxy (A38).
     */
    async start(book: Scorable, rescore = false): Promise<JobView | TryLater> {
      const v = await call(rescore ? "/v1/rescore" : "/v1/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(scoringRequest(book)),
      });
      if (!v) throw new Error("the scoring proxy has no scoring route");
      return v;
    },
    /** Sends verdict rows (07.5): exactly `{ rows }`, each row exactly its three fields. Throws unless the proxy took them. */
    async sendVerdicts(rows: readonly VerdictRow[]): Promise<void> {
      const batch: VerdictBatch = { rows: rows.map(({ pieceId, emotions, verdict }) => ({ pieceId, emotions: [...emotions], verdict })) };
      const res = await fetchImpl(`${base}/v1/verdicts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(batch) });
      if (!res.ok) throw new Error(`the scoring proxy answered ${res.status}`);
    },
    /** The job's progress; null when the proxy no longer knows it. */
    async status(jobId: string): Promise<JobView | null> {
      const v = await call(`/v1/jobs/${encodeURIComponent(jobId)}`);
      // The status route starts nothing, so the proxy never refuses it; a 429 here is an error like any other.
      if (v && "tryLater" in v) throw new Error("the scoring proxy answered 429");
      return v;
    },
  };
}

export type ScoringApi = ReturnType<typeof createScoringApi>;
