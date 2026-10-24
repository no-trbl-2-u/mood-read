// Matching research chapters to the audiobook's chapters (01.2; Open questions 4): summaries number and name chapters
// their own way, and an audiobook adds credits, prologues and splits. A found chapter is matched first by title, then
// by order (its number in the sources against the audiobook chapter's number); an audiobook chapter nothing matches
// gets no mood, so it stays unscored rather than borrowing a neighbour's (A19).
import type { FoundChapter } from "./research.ts";
import { titleNumber } from "./research.ts";

/** A title reduced for comparison: "Chapter 3: The Storm" and "the storm" meet; a bare "Chapter 3" reduces to "". */
export function titleKey(title: string): string {
  return title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\s*(?:chapter|ch\.?|part|book|section)\s+(?:\d+|[ivxlcdm]+|[a-z]+-?[a-z]*)\s*(?:[:.\-–—]\s*|$)/, "")
    .replace(/^\s*\d+\s*(?:[:.\-–—]\s*|$)/, "")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function sameTitle(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.includes(short);
}

/**
 * Assigns found chapters to the audiobook chapters at `indices` (titles from `titles`). Each found chapter is used
 * at most once. Returns audiobook index to found chapter.
 */
export function matchChapters(found: FoundChapter[], titles: string[], indices: number[]): Map<number, FoundChapter> {
  const used = new Set<number>();
  const out = new Map<number, FoundChapter>();
  const keys = found.map((f) => titleKey(f.sourceTitle));
  const whole = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const wholes = found.map((f) => whole(f.sourceTitle));

  // The same title, word for word ("Chapter 1" and "chapter 1"), first.
  for (const i of indices) {
    const w = whole(titles[i]);
    const j = wholes.findIndex((fw, jj) => !used.has(jj) && !!w && fw === w);
    if (j >= 0) {
      used.add(j);
      out.set(i, found[j]);
    }
  }
  // Then the same title under different numbering ("Chapter 3: The Storm" and "The Storm").
  for (const i of indices) {
    if (out.has(i)) continue;
    const k = titleKey(titles[i]);
    if (!k) continue;
    const j = keys.findIndex((fk, jj) => !used.has(jj) && sameTitle(k, fk));
    if (j >= 0) {
      used.add(j);
      out.set(i, found[j]);
    }
  }
  // Order: chapters numbered in their titles first, then the rest by position, so "Opening Credits" (position 1)
  // never takes chapter 1's summary from "Chapter 1".
  const byOrder = (i: number, n: number) => {
    const j = found.findIndex((f, jj) => !used.has(jj) && f.sourceNumber > 0 && f.sourceNumber === n);
    if (j >= 0) {
      used.add(j);
      out.set(i, found[j]);
    }
  };
  for (const i of indices) {
    const n = titleNumber(titles[i]);
    if (!out.has(i) && n !== null) byOrder(i, n);
  }
  for (const i of indices) {
    if (!out.has(i) && titleNumber(titles[i]) === null) byOrder(i, i + 1);
  }
  return out;
}
