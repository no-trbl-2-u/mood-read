// Scoring a public-domain book from its own text (05.9, A10): the text path beside research.ts's web search. Given a
// Project Gutenberg number, the job reads the book's text (gutenberg.ts), matches its chapters to the audiobook's by
// title then order (match.ts, with its A19 rules), and has the model read each matched chapter's own text into
// emotions with intensities and scenes, citing the ebook's Gutenberg page. Pieces are then named exactly as for a
// web-researched book (job.ts, pieces.ts).
//
// The text is never kept (A10, Open questions 7): it lives in memory for the run (TextSource holds the last book read,
// so a run's steps need not fetch it again), and the job's saved state holds only which text chapter matched which
// audiobook chapter, by number. An audiobook chapter the text does not match is unscored (`too-little`), never
// borrowed from a neighbour; when the text is missing or matches no chapter at all, the whole book falls back to the
// web research path.
import type { CompletionRequest, JsonSchema } from "./clients.ts";
import { EMOTIONS, MAX_SCENES, type BookRequest, type EmotionScore, type Scene, type SourceLink } from "./contract.ts";
import { asFound, fetchGutenbergText, gutenbergBookUrl, NoText, splitChapters, stripBoilerplate, type TextChapter } from "./gutenberg.ts";
import { matchChapters } from "./match.ts";
import { cleanEmotions, cleanScenes } from "./validate.ts";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Characters of chapter text handed to the model in one step (about 50k tokens). */
export const TEXT_CHARS_PER_STEP = 200_000;
/** A chapter longer than this is read as its beginning, middle and end, a third of this each. */
export const MAX_CHAPTER_CHARS = 60_000;

/** Where a book's chapters come from: Project Gutenberg in production, fixture text in tests. */
export type TextSource = {
  /** The book's chapters; NoText when it has no usable text. */
  chapters(gutenbergId: string): Promise<TextChapter[]>;
};

/**
 * Project Gutenberg's text, held in memory for the book being read and nowhere else: one book at a time, so a run's
 * later steps (each a separate alarm on the same Durable Object) reuse it, and a new book replaces it.
 */
export function gutenbergSource(fetchImpl: Fetch = fetch): TextSource {
  let held: { id: string; chapters: TextChapter[] } | null = null;
  return {
    async chapters(id) {
      if (held?.id === id) return held.chapters;
      held = null;
      const chapters = splitChapters(stripBoilerplate(await fetchGutenbergText(id, fetchImpl)));
      if (!chapters.length) throw new NoText(`Project Gutenberg #${id} has no chapter headings`);
      held = { id, chapters };
      return chapters;
    },
  };
}

/** What the job saves between steps: numbers only, never text. */
export type TextRun = {
  gutenbergId: string;
  /** Per audiobook chapter: the index of the text chapter it matched, or null. */
  match: (number | null)[];
  /** The next audiobook chapter to read. */
  cursor: number;
};

/** The audiobook chapters matched to the text's chapters, by title then chapter number (match.ts). */
export function planText(book: BookRequest, gutenbergId: string, chapters: TextChapter[]): TextRun {
  const found = asFound(chapters);
  const matched = matchChapters(found, book.chapters, book.chapters.map((_, i) => i));
  return { gutenbergId, match: book.chapters.map((_, i) => (matched.has(i) ? found.indexOf(matched.get(i)!) : null)), cursor: 0 };
}

/** A chapter's text as the model reads it: whole, or its beginning, middle and end when it is very long. */
export function excerpt(text: string, max = MAX_CHAPTER_CHARS): string {
  if (text.length <= max) return text;
  const part = Math.floor(max / 3);
  const mid = Math.floor((text.length - part) / 2);
  return [text.slice(0, part), text.slice(mid, mid + part), text.slice(text.length - part)].join("\n\n[...]\n\n");
}

/** The next audiobook chapters to read in one step: from the cursor, within TEXT_CHARS_PER_STEP (at least one). */
export function nextBatch(run: TextRun, chapters: TextChapter[]): number[] {
  const out: number[] = [];
  let chars = 0;
  for (let i = run.cursor; i < run.match.length; i++) {
    const m = run.match[i];
    const size = m === null ? 0 : Math.min(chapters[m]?.text.length ?? 0, MAX_CHAPTER_CHARS);
    if (out.length && chars + size > TEXT_CHARS_PER_STEP) break;
    out.push(i);
    chars += size;
  }
  return out;
}

const emotionList: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["emotion", "intensity"],
    properties: { emotion: { type: "string", enum: [...EMOTIONS] }, intensity: { type: "number" } },
  },
};

const textMoodSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["chapters"],
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chapter", "coverage", "emotions", "scenes"],
        properties: {
          chapter: { type: "integer" },
          coverage: { type: "string", enum: ["scored", "too-little"] },
          emotions: emotionList,
          scenes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["emotions", "span"],
              properties: { emotions: emotionList, span: { type: "number" } },
            },
          },
        },
      },
    },
  },
};

/** One reading: the matched chapters' own text, each under its audiobook number (index + 1). */
export function textMoodRequest(book: BookRequest, items: { index: number; text: string }[]): CompletionRequest {
  const body = items.map((c) => `=== Chapter ${c.index + 1}: ${book.chapters[c.index]} ===\n${excerpt(c.text)}`).join("\n\n");
  return {
    name: "text_moods",
    schema: textMoodSchema,
    system: [
      "You read the full text of chapters of a public-domain book and name the emotions each chapter evokes in a reader.",
      `Use only these emotions: ${EMOTIONS.join(", ")}. Give one to four per chapter, each with an intensity from 0 to 1, strongest first.`,
      "Answer for every chapter you are given, by its number. Work only from the chapter's own text.",
      "If a chapter's text is too short or is not narrative (a list, a preface of credits), set its coverage to too-little with no emotions. Never guess.",
      `When a chapter's mood changes as it goes, also give its scenes in order, two to ${MAX_SCENES}, each with its own emotions from the same set`,
      "and a span: the fraction of the chapter it covers, the spans summing to 1. Otherwise give no scenes (an empty list).",
      "Text marked [...] is cut for length; the parts around it are the chapter's beginning, middle and end.",
      "Never describe, quote or summarise what happens in a chapter or a scene: return emotions and spans only.",
    ].join(" "),
    user: `Book: ${book.title}${book.author ? ` by ${book.author}` : ""}\n\n${body}`,
  };
}

export type TextDraft = { emotions: EmotionScore[]; scenes: Scene[]; sources: SourceLink[] };

/** The source a text-scored chapter cites: the ebook's page on Project Gutenberg, never a copy of its text. */
export const textSource = (book: BookRequest, gutenbergId: string): SourceLink => ({
  url: gutenbergBookUrl(gutenbergId),
  title: `${book.title}, Project Gutenberg eBook #${gutenbergId}`,
});

/**
 * Reads the model's answer for the chapters it was given: a chapter is scored only with at least one emotion in the
 * fixed set; its scenes are cleaned as a web-scored chapter's are (validate.ts). Any chapter not asked about is ignored.
 */
export function parseTextMoods(value: unknown, asked: number[], source: SourceLink): Map<number, TextDraft> {
  const out = new Map<number, TextDraft>();
  const list = (value as { chapters?: unknown })?.chapters;
  if (!Array.isArray(list)) return out;
  const set = new Set(asked);
  for (const c of list) {
    const r = c as Record<string, unknown>;
    const i = typeof r?.chapter === "number" && Number.isInteger(r.chapter) ? r.chapter - 1 : -1;
    if (!set.has(i) || out.has(i) || r.coverage !== "scored") continue;
    const emotions = cleanEmotions(r.emotions);
    if (!emotions.length) continue;
    out.set(i, { emotions, scenes: cleanScenes(r.scenes, emotions), sources: [source] });
  }
  return out;
}

export type TextStep =
  /** No usable text, or none of it matched: research the whole book on the web instead. */
  | { kind: "fallback"; reason: string }
  | { kind: "read"; text: TextRun; drafts: Map<number, TextDraft>; unscored: number[]; done: boolean };

/**
 * One step of the text path. The first step reads and matches the text (a missing text or no match at all is a
 * fallback); every step then reads the next batch of matched chapters in one model call. Unmatched chapters in the
 * batch, and chapters the model finds too little in, come back as unscored. A failed fetch on a later step throws, to
 * be retried as any step is.
 */
export async function textStep(ctx: {
  book: BookRequest;
  gutenbergId: string;
  text: TextRun | undefined;
  source: TextSource;
  complete(req: CompletionRequest): Promise<unknown>;
}): Promise<TextStep> {
  let chapters: TextChapter[];
  try {
    chapters = await ctx.source.chapters(ctx.gutenbergId);
  } catch (e) {
    if (!ctx.text) return { kind: "fallback", reason: e instanceof Error ? e.message : String(e) };
    throw e;
  }
  const run = ctx.text ?? planText(ctx.book, ctx.gutenbergId, chapters);
  if (!ctx.text && run.match.every((m) => m === null)) return { kind: "fallback", reason: "no chapter of the text matched the audiobook's" };
  const batch = nextBatch(run, chapters);
  const items = batch.filter((i) => run.match[i] !== null && chapters[run.match[i]!]).map((i) => ({ index: i, text: chapters[run.match[i]!].text }));
  const drafts = items.length
    ? parseTextMoods(await ctx.complete(textMoodRequest(ctx.book, items)), items.map((c) => c.index), textSource(ctx.book, ctx.gutenbergId))
    : new Map<number, TextDraft>();
  const next: TextRun = { ...run, cursor: run.cursor + batch.length };
  return { kind: "read", text: next, drafts, unscored: batch.filter((i) => !drafts.has(i)), done: next.cursor >= run.match.length };
}
