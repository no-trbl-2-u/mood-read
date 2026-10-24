// Request validation (01.2, A22): the proxy accepts a book's title, author and chapter titles and nothing more. Any
// other field, of any name, is refused rather than ignored, so nothing about the listener can ride along.
import type { BookRequest } from "./contract.ts";

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
