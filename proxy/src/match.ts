// Matching research chapters to the audiobook's chapters (01.2; Open questions 4): summaries number and name chapters
// their own way, and an audiobook adds credits, prologues and splits. A found chapter is matched first by title, then
// by order (its number in the sources against the number in the audiobook chapter's title); an audiobook chapter
// nothing matches gets no mood, so it stays unscored rather than borrowing a neighbour's (A19). There is no match by
// bare position: an audiobook's credits and prologues shift its positions against the sources' numbering.
import type { FoundChapter } from "./research.ts";
import { titleNumber } from "./research.ts";

/** A title's words for comparison: "Chapter 3: The Storm" and "the storm" meet; a bare "Chapter 3" has none. */
export function titleWords(title: string): string[] {
  return title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/^\s*(?:chapter|ch\.?|part|book|section)\s+(?:\d+|[ivxlcdm]+|[a-z]+-?[a-z]*)\s*(?:[:.\-–—]\s*|$)/, "")
    .replace(/^\s*\d+\s*(?:[:.\-–—]\s*|$)/, "")
    .replace(/^the\s+/, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A title reduced for comparison: its words run together. */
export const titleKey = (title: string): string => titleWords(title).join("");

/** One title's words appear, whole and in order, inside the other's ("The Storm" in "The Storm Breaks", never "Home" in "Homecoming"). */
function containsWords(a: string[], b: string[]): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (!short.length || short.join("").length < 4) return false;
  for (let s = 0; s + short.length <= long.length; s++) {
    if (short.every((w, k) => long[s + k] === w)) return true;
  }
  return false;
}

/**
 * Assigns found chapters to the audiobook chapters at `indices` (titles from `titles`). Each found chapter is used
 * at most once. Returns audiobook index to found chapter.
 */
export function matchChapters(found: FoundChapter[], titles: string[], indices: number[]): Map<number, FoundChapter> {
  const used = new Set<number>();
  const out = new Map<number, FoundChapter>();
  const whole = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const wholes = found.map((f) => whole(f.sourceTitle));
  const words = found.map((f) => titleWords(f.sourceTitle));
  const keys = words.map((w) => w.join(""));

  const take = (i: number, j: number) => {
    if (j < 0) return;
    used.add(j);
    out.set(i, found[j]);
  };
  // Each pass runs over the whole batch before the next, looser one, so a looser match never takes a found chapter
  // that another audiobook chapter matches more closely ("Home" never takes "Homecoming" from "Chapter 5: Homecoming").
  // The same title, word for word ("Chapter 1" and "chapter 1"), first.
  for (const i of indices) {
    const w = whole(titles[i]);
    if (w) take(i, wholes.findIndex((fw, j) => !used.has(j) && fw === w));
  }
  // Then the same title under different numbering ("Chapter 3: The Storm" and "The Storm").
  for (const i of indices) {
    const k = titleKey(titles[i]);
    if (!out.has(i) && k) take(i, keys.findIndex((fk, j) => !used.has(j) && fk === k));
  }
  // Then one title's whole words inside the other's ("The Storm" and "The Storm Breaks").
  for (const i of indices) {
    const ws = titleWords(titles[i]);
    if (!out.has(i) && ws.length) take(i, words.findIndex((fw, j) => !used.has(j) && containsWords(ws, fw)));
  }
  // Last, order: a chapter numbered in its title takes the found chapter with that number in the sources' numbering.
  // An audiobook chapter with no number in its title is never matched by its position.
  for (const i of indices) {
    const n = titleNumber(titles[i]);
    if (!out.has(i) && n !== null) take(i, found.findIndex((f, j) => !used.has(j) && f.sourceNumber > 0 && f.sourceNumber === n));
  }
  return out;
}
