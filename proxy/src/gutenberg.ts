// A public-domain book's own text, from Project Gutenberg (05.9, A10): fetched by its ebook number, the Project
// Gutenberg header and license footer stripped, and split into chapters. The text lives only in memory for the run
// that reads it: nothing here writes it anywhere, and the job keeps only which chapter matched which (text-research.ts).
// `fetch` is injected, so tests run on fixture text and never reach the network.
import type { FoundChapter } from "./research.ts";
import { titleNumber } from "./research.ts";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The plain-text file, from Project Gutenberg's own high-speed mirror: its terms keep www.gutenberg.org for human
 * visitors and send automated downloads to a listed mirror (gutenberg.org/policy/terms_of_use.html, MIRRORS.ALL; the
 * rights-checker's verdict for 05.9). The path is the main site's canonical cache/epub layout.
 */
export const gutenbergTextUrl = (id: string) => `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}.txt`;
/** The ebook's landing page on the main site, never a file: the source a text-scored chapter cites. */
export const gutenbergBookUrl = (id: string) => `https://www.gutenberg.org/ebooks/${id}`;

/** The largest file read, in bytes; a longer one is cut here (the longest novels run to about 3.5 MB). */
export const MAX_TEXT_BYTES = 6 * 1024 * 1024;
/** A section shorter than this many words is a contents line or a heading, never a chapter. */
export const MIN_CHAPTER_WORDS = 150;

export type TextChapter = {
  /** The heading as the text gives it, with its title when it has one ("Chapter I: Down the Rabbit-Hole"). */
  title: string;
  /** Its chapter number, or 0 when the text gives none or numbers chapters again in each part. */
  number: number;
  text: string;
};

/** A descriptive User-Agent with a contact, as Project Gutenberg's terms ask of tools. */
export const USER_AGENT = "MoodRead/1.0 (scoring proxy, one book at a time; https://github.com/no-trbl-2-u/mood-read)";

/** Thrown when the book has no usable text: none at that number, or none that splits into chapters. */
export class NoText extends Error {}

/** Fetches an ebook's plain text. A missing book is NoText; any other failure throws to be retried. */
export async function fetchGutenbergText(id: string, fetchImpl: Fetch = fetch): Promise<string> {
  const res = await fetchImpl(gutenbergTextUrl(id), { headers: { "user-agent": USER_AGENT } });
  if (res.status === 404 || res.status === 410) throw new NoText(`no text for Project Gutenberg #${id}`);
  if (!res.ok) throw new Error(`project gutenberg answered ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder("utf-8").decode(bytes.length > MAX_TEXT_BYTES ? bytes.subarray(0, MAX_TEXT_BYTES) : bytes);
}

const START = /^\s*\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK\b.*$/im;
const END = /^\s*\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK\b.*$/im;
const OLD_START = /^.*\bEND\b.*\bSMALL PRINT\b.*$/im;
const OLD_END = /^\s*End of (?:the |this )?Project Gutenberg'?s?\b.*$/im;

/**
 * The book's own text, without Project Gutenberg's header and license: everything between the START and END marker
 * lines (the old "*END*THE SMALL PRINT" header and "End of the Project Gutenberg EBook" footer too). A text with no
 * marker is returned whole, trimmed.
 */
export function stripBoilerplate(raw: string): string {
  let text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const start = START.exec(text) ?? OLD_START.exec(text);
  if (start) text = text.slice(start.index + start[0].length);
  const end = END.exec(text);
  if (end) text = text.slice(0, end.index);
  // An old footer line sometimes comes just before the END marker; cut at it too.
  const oldEnd = OLD_END.exec(text);
  if (oldEnd) text = text.slice(0, oldEnd.index);
  return text.trim();
}

const NUMBER_WORDS = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";
/** "CHAPTER I.", "Chapter 12: The Storm", "CHAPTER THE FIRST" is not; "CHAPTER ONE. Arrival" is. */
const CHAPTER = new RegExp(`^\\s*chapter\\s+(\\d+|[ivxlcdm]+|${NUMBER_WORDS})\\b\\s*[.:\\-–—]?\\s*(.*)$`, "i");
/** "IV. THE STORM" or a bare "IV." on its own line: roman numerals, upper case, as many older texts head chapters. */
const ROMAN = /^\s*([IVXLC]+)\.?\s*(?:[.:\-–—]\s*)?([^a-z]*)$/;
/** A part, book or volume heading: it divides chapters and is never one (A19: a part number never takes a chapter's text). */
const DIVIDER = new RegExp(`^\\s*(?:part|book|volume|vol\\.)\\s+(?:\\d+|[ivxlcdm]+|${NUMBER_WORDS}|the\\s+\\w+)\\b.*$`, "i");

const words = (s: string) => (s.match(/[A-Za-z0-9À-ɏ']+/g) ?? []).length;

/** A table of contents: a run of chapter headings with little else (a third of its lines or more). */
function isContents(body: string[]): boolean {
  const filled = body.map((l) => l.trim()).filter(Boolean);
  const heads = filled.filter((l) => l.length <= 90 && (CHAPTER.test(l) || ROMAN.test(l))).length;
  return filled.length > 0 && heads / filled.length >= 1 / 3;
}

type Heading = { line: number; title: string; number: number; divider: boolean; skip: number };

function headingAt(lines: string[], i: number): Heading | null {
  const line = lines[i].trim();
  if (!line || line.length > 90) return null;
  // A heading stands apart: a blank line (or the start) before it.
  if (i > 0 && lines[i - 1].trim()) return null;
  if (DIVIDER.test(line)) return { line: i, title: line, number: 0, divider: true, skip: 0 };
  const c = CHAPTER.exec(line) ?? ROMAN.exec(line);
  if (!c) return null;
  const n = titleNumber(`chapter ${c[1]}`);
  if (!n) return null;
  let name = (c[2] ?? "").trim().replace(/[.:\-–—\s]+$/, "");
  let skip = 0;
  // "CHAPTER I." then its title alone on the next line: a short line followed by a blank one.
  // Or after one blank line, when it is in capitals ("II." / "" / "THE RED-HEADED LEAGUE"): prose never is.
  if (!name) {
    const next = lines[i + 1]?.trim() ?? "";
    const after = lines[i + 2]?.trim() ?? "";
    const short = (s: string) => !!s && s.length <= 80 && !/[,;]$/.test(s);
    if (short(next) && !after) {
      name = next.replace(/[.\s]+$/, "");
      skip = 1;
    } else if (!next && short(after) && !/[a-z]/.test(after) && /[A-Z]/.test(after) && !(lines[i + 3]?.trim() ?? "")) {
      name = after.replace(/[.\s]+$/, "");
      skip = 2;
    }
  }
  return { line: i, title: name ? `Chapter ${c[1]}: ${name}` : `Chapter ${c[1]}`, number: n, divider: false, skip };
}

/**
 * Splits a stripped text into its chapters, in order. A chapter starts at a heading line ("CHAPTER I.", "Chapter 12:
 * The Storm", "IV. THE STORM") standing after a blank line and runs to the next heading; a part, book or volume heading
 * ends a chapter and starts none. A section under MIN_CHAPTER_WORDS (a contents line, a heading alone) is dropped, so
 * the table of contents never counts as chapters. When chapter numbers repeat (each part numbering from one again) no
 * chapter keeps its number, so none is matched by order and none can take another's text (A19). A text with no
 * chapter headings has no chapters.
 */
export function splitChapters(text: string): TextChapter[] {
  const lines = text.split("\n");
  const heads: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const h = headingAt(lines, i);
    if (h) heads.push(h);
  }
  const out: TextChapter[] = [];
  heads.forEach((h, k) => {
    if (h.divider) return;
    const end = k + 1 < heads.length ? heads[k + 1].line : lines.length;
    const bodyLines = lines.slice(h.line + 1 + h.skip, end);
    const body = bodyLines.join("\n").trim();
    if (words(body) < MIN_CHAPTER_WORDS || isContents(bodyLines)) return;
    out.push({ title: h.title, number: h.number, text: body });
  });
  const counts = new Map<number, number>();
  for (const c of out) counts.set(c.number, (counts.get(c.number) ?? 0) + 1);
  if ([...counts.values()].some((n) => n > 1)) return out.map((c) => ({ ...c, number: 0 }));
  return out;
}

/** The text's chapters as match.ts reads found chapters: a title and a number, nothing scored yet. */
export function asFound(chapters: TextChapter[]): FoundChapter[] {
  return chapters.map((c) => ({ sourceTitle: c.title, sourceNumber: c.number, coverage: "scored", emotions: [], scenes: [], sources: [] }));
}
