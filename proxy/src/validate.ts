// Request validation (01.2, A22): the proxy accepts a book's title, author and chapter titles and nothing more. Any
// other field, of any name, is refused rather than ignored, so nothing about the listener can ride along.
import { EMOTIONS, MAX_SCENES, MIN_SCENE_SPAN, SCENE_SPAN_STEP, type BookRequest, type Emotion, type EmotionScore, type Scene } from "./contract.ts";

export const LIMITS = {
  /** The largest request body read, in bytes. */
  bodyBytes: 64 * 1024,
  title: 300,
  author: 300,
  chapterTitle: 300,
  chapters: 300,
} as const;

const ALLOWED = ["title", "author", "chapters"] as const;

export type Parsed = { ok: true; book: BookRequest } | { ok: false; error: string };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Validates a parsed JSON body. Strings are trimmed and whitespace-collapsed; the author may be empty. */
export function parseBookRequest(body: unknown): Parsed {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "body must be a JSON object" };
  const extra = Object.keys(body).filter((k) => !(ALLOWED as readonly string[]).includes(k));
  if (extra.length) return { ok: false, error: `only title, author and chapters are accepted; refused: ${extra.join(", ")}` };
  const { title, author, chapters } = body as Record<string, unknown>;

  if (typeof title !== "string" || !clean(title)) return { ok: false, error: "title must be a non-empty string" };
  if (clean(title).length > LIMITS.title) return { ok: false, error: `title is longer than ${LIMITS.title} characters` };
  if (typeof author !== "string") return { ok: false, error: "author must be a string" };
  if (clean(author).length > LIMITS.author) return { ok: false, error: `author is longer than ${LIMITS.author} characters` };
  if (!Array.isArray(chapters) || chapters.length === 0) return { ok: false, error: "chapters must be a non-empty array of titles" };
  if (chapters.length > LIMITS.chapters) return { ok: false, error: `at most ${LIMITS.chapters} chapters` };
  const titles: string[] = [];
  for (const c of chapters) {
    if (typeof c !== "string") return { ok: false, error: "every chapter must be a title string" };
    const t = clean(c);
    if (!t) return { ok: false, error: "a chapter title is empty" };
    if (t.length > LIMITS.chapterTitle) return { ok: false, error: `a chapter title is longer than ${LIMITS.chapterTitle} characters` };
    titles.push(t);
  }
  return { ok: true, book: { title: clean(title), author: clean(author), chapters: titles } };
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The cache key and job id for a book: a SHA-256 over its normalized title, author and chapter titles. Any listener
 * who sends the same book gets the same key, so one research run serves them all; the key names the book, never
 * the listener.
 */
export async function bookKey(book: BookRequest): Promise<string> {
  const text = JSON.stringify([norm(book.title), norm(book.author), book.chapters.map(norm)]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const isJobId = (id: string) => /^[0-9a-f]{64}$/.test(id);

// ---- what the model returns: emotions and scenes (01.2; 07.1, A1) ----

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

const EPS = 1e-9;

/**
 * A scored chapter's scenes from the model's answer (spec 07, Decisions): in order, 1 to MAX_SCENES, each with
 * emotions from the fixed set and a span. Spans are normalised to sum to 1; a span under MIN_SCENE_SPAN is merged into
 * its smaller neighbour (which keeps its own emotions) until every span is at least MIN_SCENE_SPAN and at most
 * MAX_SCENES are left; then spans are rounded to SCENE_SPAN_STEP so they still sum to exactly 1. A scene with no
 * usable emotions gives its span to the scene before it (else the one after); one with no usable span is dropped.
 * A scene is rebuilt from its emotions and span alone, so any text on it is stripped (A21). When fewer than two
 * scenes are left, or the answer has none, the chapter is one scene: span 1 with the chapter's own emotions. An
 * unscored chapter (no emotions) has no scenes.
 */
export function cleanScenes(raw: unknown, chapter: EmotionScore[]): Scene[] {
  if (!chapter.length) return [];
  const one: Scene[] = [{ emotions: chapter, span: 1 }];
  if (!Array.isArray(raw)) return one;
  let list: Scene[] = [];
  let carry = 0;
  for (const r of raw) {
    const span = (r as { span?: unknown })?.span;
    if (typeof span !== "number" || !Number.isFinite(span) || span <= 0) continue;
    const emotions = cleanEmotions((r as { emotions?: unknown })?.emotions);
    if (!emotions.length) {
      if (list.length) list[list.length - 1].span += span;
      else carry += span;
      continue;
    }
    list.push({ emotions, span: span + carry });
    carry = 0;
  }
  if (list.length < 2) return one;
  const total = list.reduce((t, x) => t + x.span, 0);
  list = list.map((x) => ({ emotions: x.emotions, span: x.span / total }));
  while (list.length > 1 && (list.length > MAX_SCENES || list.some((x) => x.span < MIN_SCENE_SPAN - EPS))) {
    let k = 0;
    list.forEach((x, i) => {
      if (x.span < list[k].span - EPS) k = i;
    });
    const j = k === 0 ? 1 : k === list.length - 1 ? k - 1 : list[k + 1].span < list[k - 1].span - EPS ? k + 1 : k - 1;
    list[j] = { emotions: list[j].emotions, span: list[j].span + list[k].span };
    list.splice(k, 1);
  }
  if (list.length < 2) return one;
  const units = Math.round(1 / SCENE_SPAN_STEP);
  const exact = list.map((x) => x.span * units);
  const whole = exact.map((x) => Math.floor(x + EPS));
  let left = units - whole.reduce((t, x) => t + x, 0);
  const byRemainder = exact.map((x, i) => ({ i, r: x - whole[i] })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    whole[i] += 1;
    left -= 1;
  }
  return list.map((x, i) => ({ emotions: x.emotions, span: round2(whole[i] * SCENE_SPAN_STEP) }));
}
