// The proxy's storage seam (01.2): one small async key-value interface over which the job, its cached result and
// the spend meter are written. In production it is a Durable Object's own storage (index.ts: each book's job lives
// in its own object, the meter in one more); in tests it is memoryStore(). Values are plain JSON-shaped data.
// 07.5 adds the verdict counts (createVerdictCounts), kept in one more object.
import type { VerdictRow } from "./contract.ts";
import { emotionSetKey } from "./validate.ts";

export type Store = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
};

/** An in-memory Store. Values are deep-copied in and out, as a real store's serialization would. */
export function memoryStore(): Store & { keys(): string[] } {
  const map = new Map<string, string>();
  return {
    async get<T>(key: string) {
      const raw = map.get(key);
      return raw === undefined ? undefined : (JSON.parse(raw) as T);
    },
    async put<T>(key: string, value: T) {
      map.set(key, JSON.stringify(value));
    },
    async delete(key: string) {
      return map.delete(key);
    },
    keys: () => [...map.keys()],
  };
}

// ---- the listener's say, as counts (07.5, spec 07 A6) ----

/** How often a piece was kept ("fits") and turned away ("misfit") for one emotion set. */
export type VerdictCount = { fits: number; misfits: number };
/** One piece's counts, by emotion set (validate.ts emotionSetKey: names in the fixed set's order, comma-joined). */
export type PieceCounts = Record<string, VerdictCount>;

export const verdictCountsKey = (pieceId: string) => `verdicts:${pieceId}`;

/**
 * The verdict counts over a Store (in production the VerdictCounts object's own storage, index.ts). A batch is folded
 * into counts per (piece id, emotion set) and only the counts are written: the proxy never keeps a row, so nothing
 * of who sent it, or when, or how the rows came together is left (A6).
 */
export function createVerdictCounts(store: Store) {
  return {
    async add(rows: readonly VerdictRow[]): Promise<void> {
      const byPiece = new Map<string, PieceCounts>();
      for (const r of rows) {
        const piece = byPiece.get(r.pieceId) ?? {};
        const set = emotionSetKey(r.emotions);
        const c = piece[set] ?? { fits: 0, misfits: 0 };
        piece[set] = r.verdict === "fits" ? { fits: c.fits + 1, misfits: c.misfits } : { fits: c.fits, misfits: c.misfits + 1 };
        byPiece.set(r.pieceId, piece);
      }
      for (const [pieceId, add] of byPiece) {
        const had = (await store.get<PieceCounts>(verdictCountsKey(pieceId))) ?? {};
        const next: PieceCounts = { ...had };
        for (const [set, c] of Object.entries(add)) {
          const old = had[set] ?? { fits: 0, misfits: 0 };
          next[set] = { fits: old.fits + c.fits, misfits: old.misfits + c.misfits };
        }
        await store.put(verdictCountsKey(pieceId), next);
      }
    },
    /** The counts of each piece asked for that has any; a piece with none is absent. */
    async counts(pieceIds: readonly string[]): Promise<Record<string, PieceCounts>> {
      const out: Record<string, PieceCounts> = {};
      for (const id of new Set(pieceIds)) {
        const c = await store.get<PieceCounts>(verdictCountsKey(id));
        if (c) out[id] = c;
      }
      return out;
    },
  };
}

export type VerdictCounts = ReturnType<typeof createVerdictCounts>;
