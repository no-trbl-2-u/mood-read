// Browse's one read from the scoring proxy (05.10, A11): the pre-scored books' overall emotions, the whole book's and
// never a chapter's, for a page of results in one call (GET /v1/overall?ids=...). It sends only public LibriVox
// catalog numbers (agents.md rule 6), carries no key (A22) and never starts a scoring run. Any failure reads as "none
// scored": Browse works the same without it. Pure: `fetch` is handed in, so tests run it against a fake proxy.
import { EMOTIONS, type EmotionScore } from "./types.ts";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** At most this many numbers per call (the proxy's own limit); a Browse page holds 20. */
export const OVERALL_MAX_IDS = 50;
/** At most this many emotions per book, strongest first. */
export const OVERALL_TOP = 3;

export type Overall = Record<string, EmotionScore[]>;

const CATALOG_ID = /^[1-9][0-9]{0,8}$/;

/** Reads the proxy's answer: per asked-for number, emotions from the fixed set only; anything off is dropped. */
export function readOverall(body: unknown, asked: string[]): Overall {
  const books = (body as { books?: unknown })?.books;
  const out: Overall = {};
  if (!books || typeof books !== "object") return out;
  for (const id of asked) {
    const raw = (books as Record<string, { emotions?: unknown }>)[id]?.emotions;
    if (!Array.isArray(raw)) continue;
    const emotions = raw
      .filter(
        (e): e is EmotionScore =>
          (EMOTIONS as readonly string[]).includes(e?.emotion) && typeof e?.intensity === "number" && Number.isFinite(e.intensity) && e.intensity > 0 && e.intensity <= 1,
      )
      .map((e) => ({ emotion: e.emotion, intensity: e.intensity }))
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, OVERALL_TOP);
    if (emotions.length) out[id] = emotions;
  }
  return out;
}

/** The pre-scored books among these LibriVox numbers, in one call; {} when none, when no number is valid, or on any failure. */
export async function fetchOverall(baseUrl: string, fetchImpl: Fetch, ids: (string | null | undefined)[]): Promise<Overall> {
  const asked = [...new Set(ids.filter((id): id is string => typeof id === "string" && CATALOG_ID.test(id)))].slice(0, OVERALL_MAX_IDS);
  if (!asked.length) return {};
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/v1/overall?ids=${asked.join(",")}`);
    if (!res.ok) return {};
    return readOverall(await res.json(), asked);
  } catch {
    return {};
  }
}
