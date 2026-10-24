// The research half of scoring (01.2, A13, A19; Open questions 4): search the web for what is written about the book
// (chapter summaries, reviews, analyses) from its title, author and chapter titles alone, then have the model read
// those search results into each chapter's emotions, with intensities and the sources they came from. The book's
// audio is never involved. Only search-engine snippets are read (no page is fetched or scraped), and only links are
// kept. A chapter the sources do not describe is `too-little`: unscored, never guessed.
import type { CompletionRequest, JsonSchema, SearchHit } from "./clients.ts";
import { EMOTIONS, type BookRequest, type Emotion, type EmotionScore, type SourceLink } from "./contract.ts";

export type Query = { q: string; /** The audiobook chapter it asks about, or null for the whole book. */ chapter: number | null };

/** Book-level queries, then one per chapter, at most this many in all. */
export const MAX_QUERIES = 48;
/** Hits kept per query. */
export const HITS_PER_QUERY = 3;
/** Sources handed to the model in one reading. */
export const MAX_SOURCES = 40;

const GENERIC = /^(?:chapter|ch\.?|part|track|disc|book|section)?\s*(?:\d+|[ivxlcdm]+)(?:\s*[:.\-]\s*)?$/i;

/** The search queries for a book: three about the whole book, then one per chapter while the budget lasts. */
export function buildQueries(book: BookRequest): Query[] {
  const name = book.author ? `"${book.title}" ${book.author}` : `"${book.title}"`;
  const queries: Query[] = [
    { q: `${name} chapter summaries`, chapter: null },
    { q: `${name} plot summary analysis`, chapter: null },
    { q: `${name} book review`, chapter: null },
  ];
  book.chapters.forEach((title, i) => {
    if (queries.length >= MAX_QUERIES) return;
    const n = chapterNumber(title, i);
    const q = GENERIC.test(title.trim()) ? `"${book.title}" chapter ${n} summary` : `"${book.title}" "${title}" summary`;
    queries.push({ q, chapter: i });
  });
  return queries;
}

export type Source = SourceLink & { id: string; snippet: string; chapter: number | null };

/** Adds a query's hits to the source list: the first few, one per URL, each with a stable id (S1, S2, ...). */
export function addSources(sources: Source[], hits: SearchHit[], chapter: number | null): Source[] {
  const seen = new Set(sources.map((s) => s.url));
  const out = [...sources];
  for (const h of hits.slice(0, HITS_PER_QUERY)) {
    if (seen.has(h.url) || !h.snippet.trim()) continue;
    seen.add(h.url);
    out.push({ id: `S${out.length + 1}`, url: h.url, title: h.title, snippet: h.snippet, chapter });
  }
  return out;
}

/** The sources for a batch of chapters: those found for these chapters first, then the book-level ones. */
export function sourcesFor(sources: Source[], chapters: number[]): Source[] {
  const set = new Set(chapters);
  const own = sources.filter((s) => s.chapter !== null && set.has(s.chapter));
  const book = sources.filter((s) => s.chapter === null);
  return [...own, ...book].slice(0, MAX_SOURCES);
}

const WORD_NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

function roman(s: string): number | null {
  if (!/^[ivxlcdm]+$/i.test(s)) return null;
  const v: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0;
  const t = s.toLowerCase();
  for (let i = 0; i < t.length; i++) {
    const cur = v[t[i]];
    const next = v[t[i + 1]] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total > 0 ? total : null;
}

/** A chapter's number from its title ("Chapter 12", "12. Arrival", "XIV", "Chapter Twelve"), or null when it has none. */
export function titleNumber(title: string): number | null {
  const t = title.toLowerCase().trim();
  const digits = /(?:^|\b(?:chapter|ch\.?|part|book|section)\s*)(\d+)\b/.exec(t);
  if (digits) return Number(digits[1]);
  const r = /^([ivxlcdm]+)\s*(?:[:.\-]|$)|\bchapter\s+([ivxlcdm]+)\b/.exec(t);
  if (r) {
    const n = roman(r[1] ?? r[2]);
    if (n) return n;
  }
  const w = /\bchapter\s+([a-z]+)\b/.exec(t);
  if (w && WORD_NUMBERS.includes(w[1])) return WORD_NUMBERS.indexOf(w[1]);
  return null;
}

/** A chapter's number in the book's own numbering: from its title, else its position. */
export function chapterNumber(title: string, index: number): number {
  return titleNumber(title) ?? index + 1;
}

// ---- reading the sources into emotions ----

export type FoundChapter = {
  /** The chapter as the sources name it. */
  sourceTitle: string;
  /** Its number in the sources' numbering, or 0 when they give none. */
  sourceNumber: number;
  coverage: "scored" | "too-little";
  emotions: EmotionScore[];
  sources: SourceLink[];
};

const moodSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["chapters"],
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceTitle", "sourceNumber", "coverage", "emotions", "sourceIds"],
        properties: {
          sourceTitle: { type: "string" },
          sourceNumber: { type: "integer" },
          coverage: { type: "string", enum: ["scored", "too-little"] },
          emotions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["emotion", "intensity"],
              properties: { emotion: { type: "string", enum: [...EMOTIONS] }, intensity: { type: "number" } },
            },
          },
          sourceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export function moodRequest(book: BookRequest, chapters: number[], sources: Source[]): CompletionRequest {
  const list = chapters.map((i) => `${i + 1}. ${book.chapters[i]}`).join("\n");
  const found = sources.map((s) => `[${s.id}] ${s.title} (${s.url})\n${s.snippet}`).join("\n\n");
  return {
    name: "chapter_moods",
    schema: moodSchema,
    system: [
      "You read search results about a book and name the emotions each chapter evokes in a reader.",
      `Use only these emotions: ${EMOTIONS.join(", ")}. Give one to four per chapter, each with an intensity from 0 to 1.`,
      "Work only from the numbered search results you are given; cite the ids of the results each chapter's emotions come from.",
      "If the results do not describe a chapter well enough, set its coverage to too-little with no emotions. Never guess.",
      "Name chapters as the sources do (sourceTitle, and sourceNumber in the sources' numbering, or 0 if they give none).",
      "Never describe what happens in a chapter: return emotions only.",
    ].join(" "),
    user: `Book: ${book.title}${book.author ? ` by ${book.author}` : ""}\n\nThe audiobook's chapters to cover:\n${list}\n\nSearch results:\n\n${found || "(none)"}`,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Normalizes emotions: the fixed set only, intensity clamped to 0..1, one entry per emotion, strongest first, four at most. */
export function cleanEmotions(raw: unknown): EmotionScore[] {
  if (!Array.isArray(raw)) return [];
  const best = new Map<Emotion, number>();
  for (const e of raw) {
    const emotion = (e as { emotion?: unknown })?.emotion;
    const intensity = (e as { intensity?: unknown })?.intensity;
    if (typeof emotion !== "string" || !(EMOTIONS as readonly string[]).includes(emotion)) continue;
    if (typeof intensity !== "number" || !Number.isFinite(intensity) || intensity <= 0) continue;
    const v = round2(Math.min(1, intensity));
    best.set(emotion as Emotion, Math.max(best.get(emotion as Emotion) ?? 0, v));
  }
  return [...best].map(([emotion, intensity]) => ({ emotion, intensity })).sort((a, b) => b.intensity - a.intensity).slice(0, 4);
}

/**
 * Reads the model's answer. A chapter is `scored` only with at least one emotion and at least one cited source that
 * was really among the search results (A19); anything else is `too-little`, its emotions dropped.
 */
export function parseMoods(value: unknown, sources: Source[]): FoundChapter[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const list = (value as { chapters?: unknown })?.chapters;
  if (!Array.isArray(list)) return [];
  const out: FoundChapter[] = [];
  for (const c of list) {
    const r = c as Record<string, unknown>;
    if (typeof r?.sourceTitle !== "string") continue;
    const cited = Array.isArray(r.sourceIds) ? [...new Set(r.sourceIds.filter((x): x is string => typeof x === "string"))] : [];
    const links = cited.map((id) => byId.get(id)).filter((s): s is Source => !!s).map((s) => ({ url: s.url, title: s.title }));
    const emotions = cleanEmotions(r.emotions);
    const scored = r.coverage === "scored" && emotions.length > 0 && links.length > 0;
    out.push({
      sourceTitle: r.sourceTitle.trim(),
      sourceNumber: typeof r.sourceNumber === "number" && Number.isInteger(r.sourceNumber) && r.sourceNumber > 0 ? r.sourceNumber : 0,
      coverage: scored ? "scored" : "too-little",
      emotions: scored ? emotions : [],
      sources: scored ? links : [],
    });
  }
  return out;
}
