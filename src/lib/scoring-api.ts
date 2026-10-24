// The app's side of the scoring proxy (01.2): the only request Mood Read makes about a book. It sends the book's
// title, author and chapter titles and nothing more (agents.md rule 6), to one configured base URL, and holds no key
// (A22). Pure: `fetch` is handed in, so tests run it against a fake proxy.
import { EMOTIONS, type Book, type JobView } from "./types.ts";

/** Exactly what the proxy receives about a book. */
export function scoringRequest(book: Pick<Book, "title" | "author" | "chapters">): { title: string; author: string; chapters: string[] } {
  return { title: book.title, author: book.author, chapters: book.chapters.map((c) => c.title) };
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const STATES = ["running", "done", "capped", "failed"];

/** Checks a proxy answer's shape; anything off is an error rather than a half-read result. */
export function readJobView(body: unknown): JobView {
  const v = body as JobView;
  if (!v || typeof v.jobId !== "string" || !/^[0-9a-f]{64}$/.test(v.jobId) || !STATES.includes(v.state)) throw new Error("unexpected answer from the scoring proxy");
  const p = v.progress ?? ({} as JobView["progress"]);
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);
  const out: JobView = { jobId: v.jobId, state: v.state, progress: { step: num(p.step), steps: num(p.steps), chaptersDone: num(p.chaptersDone), chapters: num(p.chapters) } };
  if (v.state === "done") {
    if (!v.result || !Array.isArray(v.result.chapters)) throw new Error("a finished job came back without its chapters");
    for (const c of v.result.chapters) {
      if (typeof c?.index !== "number" || !c.mood || !Array.isArray(c.mood.emotions)) throw new Error("a chapter came back malformed");
      if (c.mood.emotions.some((e) => !(EMOTIONS as readonly string[]).includes(e.emotion))) throw new Error("an emotion outside the fixed set");
      if (c.pieces && [c.pieces.piece, ...c.pieces.alternates].some((p2) => p2.vocals !== "none")) throw new Error("a piece with vocals");
    }
    out.result = v.result;
  }
  return out;
}

export function createScoringApi(baseUrl: string, fetchImpl: Fetch) {
  const base = baseUrl.replace(/\/+$/, "");
  async function call(path: string, init?: RequestInit): Promise<JobView | null> {
    const res = await fetchImpl(`${base}${path}`, init);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`the scoring proxy answered ${res.status}`);
    return readJobView(await res.json());
  }
  return {
    /** Starts scoring a book (or gets its cached result); `rescore` asks for a new run explicitly. */
    async start(book: Pick<Book, "title" | "author" | "chapters">, rescore = false): Promise<JobView> {
      const v = await call(rescore ? "/v1/rescore" : "/v1/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(scoringRequest(book)),
      });
      if (!v) throw new Error("the scoring proxy has no scoring route");
      return v;
    },
    /** The job's progress; null when the proxy no longer knows it. */
    status(jobId: string): Promise<JobView | null> {
      return call(`/v1/jobs/${encodeURIComponent(jobId)}`);
    },
  };
}

export type ScoringApi = ReturnType<typeof createScoringApi>;
