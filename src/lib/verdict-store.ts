// The listener's say on what plays (07.4, spec 07 A5): "Fits" or "Doesn't fit" on a chapter's playing piece, kept on
// the device per book under `verdicts:<book id>`, at most one verdict per chapter and piece (a new one replaces it;
// clearing removes it). Nothing here leaves the device; 07.5 reads these to send aggregates. Pure over the library's
// key-value backend, so `node --test` exercises the code the app runs. Screens reach it through ./verdicts.ts.
import type { Kv } from "./library-store.ts";
import type { PieceVerdict } from "./types.ts";

export type Verdict = PieceVerdict["verdict"];

export const verdictsKey = (bookId: string) => `verdicts:${bookId}`;

/** A tap on a verdict target: the lit one clears, any other lights (07.4's call: the listener can take a say back). */
export function nextVerdict(current: Verdict | null, tapped: Verdict): Verdict | null {
  return current === tapped ? null : tapped;
}

function isVerdict(v: unknown): v is PieceVerdict {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    Number.isInteger(r.chapterIndex) &&
    (r.chapterIndex as number) >= 0 &&
    typeof r.pieceId === "string" &&
    r.pieceId.length > 0 &&
    (r.verdict === "fits" || r.verdict === "misfit") &&
    typeof r.at === "number" &&
    Number.isFinite(r.at)
  );
}

const EMPTY: readonly PieceVerdict[] = Object.freeze([]);

export function createVerdictStore(kv: Kv, now: () => number = Date.now) {
  const listeners = new Set<() => void>();
  const cache = new Map<string, readonly PieceVerdict[]>();

  function verdicts(bookId: string): readonly PieceVerdict[] {
    const hit = cache.get(bookId);
    if (hit) return hit;
    let list: readonly PieceVerdict[] = EMPTY;
    try {
      const raw = kv.getItem(verdictsKey(bookId));
      const parsed: unknown = raw == null ? [] : JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const kept = parsed.filter(isVerdict).map(({ chapterIndex, pieceId, verdict, at }) => ({ chapterIndex, pieceId, verdict, at }));
        if (kept.length > 0) list = kept;
      }
    } catch {
      list = EMPTY;
    }
    cache.set(bookId, list);
    return list;
  }

  function save(bookId: string, list: PieceVerdict[]) {
    const sorted = [...list].sort((a, b) => a.chapterIndex - b.chapterIndex || a.pieceId.localeCompare(b.pieceId));
    if (sorted.length === 0) kv.removeItem(verdictsKey(bookId));
    else kv.setItem(verdictsKey(bookId), JSON.stringify(sorted));
    cache.set(bookId, sorted.length === 0 ? EMPTY : sorted);
    listeners.forEach((l) => l());
  }

  function verdictFor(bookId: string, chapterIndex: number, pieceId: string): Verdict | null {
    return verdicts(bookId).find((v) => v.chapterIndex === chapterIndex && v.pieceId === pieceId)?.verdict ?? null;
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Every verdict kept for the book, by chapter then piece; the same array until one changes. */
    verdicts,
    verdictFor,
    /** Keeps the verdict on a chapter's piece, replacing any it had; null clears it. A no-op tells no listener. */
    setVerdict(bookId: string, chapterIndex: number, pieceId: string, verdict: Verdict | null): void {
      if (verdictFor(bookId, chapterIndex, pieceId) === verdict) return;
      const rest = verdicts(bookId).filter((v) => !(v.chapterIndex === chapterIndex && v.pieceId === pieceId));
      save(bookId, verdict === null ? rest : [...rest, { chapterIndex, pieceId, verdict, at: now() }]);
    },
    forget(bookId: string): void {
      if (verdicts(bookId).length === 0 && kv.getItem(verdictsKey(bookId)) == null) return;
      save(bookId, []);
    },
  };
}

export type VerdictStore = ReturnType<typeof createVerdictStore>;
