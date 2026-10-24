// Browse's reads from the scoring proxy (05.10, A11; 05.20, A22): the pre-scored books' overall emotions, the whole
// book's and never a chapter's, for a page of results in one call (GET /v1/overall?ids=...), and the list of
// pre-scored books Browse opens on (GET /v1/prescored?limit=...). They send only public LibriVox catalog numbers
// (agents.md rule 6), carry no key (A22) and never start a scoring run. Any failure reads as "none scored": Browse
// works the same without them. Pure: `fetch` is handed in, so tests run it against a fake proxy.
import { EMOTIONS, type EmotionScore } from "./types.ts";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** At most this many numbers per call (the proxy's own limit); a Browse page holds 20. */
export const OVERALL_MAX_IDS = 50;
/** At most this many emotions per book, strongest first. */
export const OVERALL_TOP = 3;

export type Overall = Record<string, EmotionScore[]>;

const CATALOG_ID = /^[1-9][0-9]{0,8}$/;

/** One book's emotions as the proxy sent them: the fixed set only, at most OVERALL_TOP, strongest first. */
function readEmotions(raw: unknown): EmotionScore[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is EmotionScore =>
        (EMOTIONS as readonly string[]).includes(e?.emotion) && typeof e?.intensity === "number" && Number.isFinite(e.intensity) && e.intensity > 0 && e.intensity <= 1,
    )
    .map((e) => ({ emotion: e.emotion, intensity: e.intensity }))
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, OVERALL_TOP);
}

/** Reads the proxy's answer: per asked-for number, emotions from the fixed set only; anything off is dropped. */
export function readOverall(body: unknown, asked: string[]): Overall {
  const books = (body as { books?: unknown })?.books;
  const out: Overall = {};
  if (!books || typeof books !== "object") return out;
  for (const id of asked) {
    const emotions = readEmotions((books as Record<string, { emotions?: unknown }>)[id]?.emotions);
    if (emotions.length) out[id] = emotions;
  }
  return out;
}

/** One pre-scored book in Browse's default list: its LibriVox number and overall emotions, nothing else. */
export type PrescoredBook = { id: string; emotions: EmotionScore[] };

/** How many pre-scored books Browse's default list asks for (the proxy allows up to 50). */
export const PRESCORED_LIMIT = 20;

/** Reads the listing's answer, in its order: valid numbers with at least one valid emotion, each once. */
export function readPrescored(body: unknown, limit = PRESCORED_LIMIT): PrescoredBook[] {
  const books = (body as { books?: unknown })?.books;
  if (!Array.isArray(books)) return [];
  const out: PrescoredBook[] = [];
  const seen = new Set<string>();
  for (const b of books) {
    const id = (b as { id?: unknown })?.id;
    if (typeof id !== "string" || !CATALOG_ID.test(id) || seen.has(id)) continue;
    const emotions = readEmotions((b as { emotions?: unknown }).emotions);
    if (!emotions.length) continue;
    seen.add(id);
    out.push({ id, emotions });
    if (out.length >= limit) break;
  }
  return out;
}

/** The pre-scored books Browse opens on, most recently pre-scored first; null on any failure or malformed answer. */
export async function fetchPrescored(baseUrl: string, fetchImpl: Fetch, limit = PRESCORED_LIMIT): Promise<PrescoredBook[] | null> {
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/v1/prescored?limit=${limit}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { books?: unknown };
    // An answer that is not a listing at all reads as a failure, the same as a 5xx.
    return Array.isArray(body?.books) ? readPrescored(body, limit) : null;
  } catch {
    return null;
  }
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
