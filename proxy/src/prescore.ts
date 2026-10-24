// Pre-scoring (05.10, spec 05 A11): the owner's `pnpm prescore` scores the most-downloaded LibriVox books ahead of
// time into the shared cache, and Browse shows each one's overall emotions. Three rules live here:
//
// - The budget. Pre-scoring never spends more than half of MONTHLY_CAP_USD; listeners' own books keep the other
//   half. A pre-score run is billed to its own share of the meter (bucket "prescore") as well as the month's total. A
//   pre-score step runs only while the pre-score share plus one step's reserve fits in half the cap AND the total plus
//   that reserve fits in the whole cap, so pre-scoring neither passes its half nor pushes the total over the cap. A
//   listener run is unchanged: it starts while the total is under the whole cap, so it may use whatever pre-scoring
//   left unspent, and it always has at least the half pre-scoring may never touch.
// - The owner's token. Only a request carrying `Authorization: Bearer <PRESCORE_TOKEN>` (a Worker secret, never in the
//   app) may pre-score; a Worker without the secret refuses every pre-score request.
// - The overall emotions. A book's own, never a chapter's: the top three emotions by mean intensity over its scored
//   chapters (an emotion a scored chapter lacks counts 0 there), so Browse can show the whole book's mood without
//   showing what any chapter holds (spec 01 Owner decision 7, A21). The index keeps only these, by LibriVox number.
import { EMOTIONS, type BookResult, type EmotionScore } from "./contract.ts";
import { monthOf, type Meter } from "./meter.ts";
import type { Store } from "./store.ts";
import { isCatalogId } from "./validate.ts";

/** The share of the monthly cap pre-scoring may spend (spec 05, Decisions made upfront). */
export const PRESCORE_SHARE = 0.5;
/** The meter's bucket for pre-score spend. */
export const PRESCORE_BUCKET = "prescore";
/**
 * Headroom one pre-score step must find before it runs, in US dollars: more than any one step costs (a step is at most
 * six searches, or one reading of a batch of chapters, or two rounds of piece naming), so a step that starts cannot
 * carry pre-scoring past its half or the total past the cap.
 */
export const PRESCORE_STEP_RESERVE_USD = 0.25;
/** How many emotions a book's overall mood holds. */
export const OVERALL_TOP = 3;
/** The most LibriVox numbers one Browse lookup may ask for (a page of results is 20). */
export const OVERALL_MAX_IDS = 50;
/** The shortest owner token accepted: a short one refuses everything rather than guard pre-scoring weakly. */
export const MIN_TOKEN_LENGTH = 32;

export type PrescoreBudget = {
  month: string;
  capUsd: number;
  /** Half the cap: the most pre-scoring may spend this month. */
  halfUsd: number;
  /** The month's whole spend. */
  spentUsd: number;
  /** Pre-scoring's own share of it. */
  prescoreUsd: number;
  /** True while a pre-score step may run. */
  open: boolean;
};

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Where pre-scoring stands this month, and whether a pre-score step may run now. */
export async function prescoreBudget(meter: Meter, capUsd: number, nowMs: number, reserveUsd = PRESCORE_STEP_RESERVE_USD): Promise<PrescoreBudget> {
  const month = monthOf(nowMs);
  const [spentUsd, prescoreUsd] = await Promise.all([meter.spent(month), meter.spent(month, PRESCORE_BUCKET)]);
  const halfUsd = capUsd * PRESCORE_SHARE;
  const open = prescoreUsd + reserveUsd <= halfUsd && spentUsd + reserveUsd <= capUsd;
  return { month, capUsd, halfUsd: round4(halfUsd), spentUsd: round4(spentUsd), prescoreUsd: round4(prescoreUsd), open };
}

/** True when a pre-score step may run now. */
export async function prescoreOpen(meter: Meter, capUsd: number, nowMs: number): Promise<boolean> {
  return (await prescoreBudget(meter, capUsd, nowMs)).open;
}

/** Compares two strings in time that depends on their length only, never on where they first differ. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** True only for `Bearer <token>` matching the Worker's PRESCORE_TOKEN; a missing or short secret refuses all. */
export function ownerAuthorized(authorization: string | null, token: string | undefined): boolean {
  if (!token || token.length < MIN_TOKEN_LENGTH) return false;
  const m = /^Bearer (\S+)$/.exec(authorization ?? "");
  return !!m && sameSecret(m[1], token);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A scored book's overall emotions: the top OVERALL_TOP by mean intensity over its scored chapters, strongest first
 * (ties in the fixed set's order). Built from emotions and numbers alone, so no chapter's title, index, scenes,
 * sources or pieces can ride along. A book with no scored chapter has none.
 */
export function overallEmotions(result: Pick<BookResult, "chapters">): EmotionScore[] {
  const scored = result.chapters.filter((c) => c.mood.coverage === "scored" && c.mood.emotions.length > 0);
  if (!scored.length) return [];
  const sums = new Map<string, number>();
  for (const c of scored) for (const e of c.mood.emotions) sums.set(e.emotion, (sums.get(e.emotion) ?? 0) + e.intensity);
  return EMOTIONS.map((emotion) => ({ emotion, intensity: round2((sums.get(emotion) ?? 0) / scored.length) }))
    .filter((e) => e.intensity > 0)
    .sort((a, b) => b.intensity - a.intensity || EMOTIONS.indexOf(a.emotion) - EMOTIONS.indexOf(b.emotion))
    .slice(0, OVERALL_TOP);
}

/** One indexed book: its cache key (so a later rescore of the same book can refresh it) and its overall emotions. */
type Entry = { key: string; emotions: EmotionScore[] };

/** A finished run's report to the index. */
export type IndexPut = { librivoxId: string; key: string; emotions: EmotionScore[]; prescore: boolean };

/** What Browse reads: per LibriVox number asked for and pre-scored, the book's overall emotions; nothing else. */
export type OverallView = { books: Record<string, { emotions: EmotionScore[] }> };

const entryKey = (librivoxId: string) => `lv:${librivoxId}`;

/**
 * The pre-scored books, by LibriVox number (in production one Durable Object's storage, index.ts). A pre-score run
 * adds its book; any later run of the same book (same cache key, a listener's rescore say) refreshes it. A listener's
 * own book that was never pre-scored is never added, so Browse never shows what some listener chose to score.
 */
export function createOverallIndex(store: Store) {
  return {
    async put(p: IndexPut): Promise<void> {
      if (!isCatalogId(p.librivoxId)) return;
      const k = entryKey(p.librivoxId);
      const had = await store.get<Entry>(k);
      if (!p.prescore && had?.key !== p.key) return;
      // Rebuilt from emotion and intensity alone, the fixed set only, so nothing else is ever kept.
      const emotions = p.emotions
        .filter((e) => (EMOTIONS as readonly string[]).includes(e.emotion) && Number.isFinite(e.intensity) && e.intensity > 0)
        .slice(0, OVERALL_TOP)
        .map((e) => ({ emotion: e.emotion, intensity: round2(Math.min(1, e.intensity)) }));
      if (!emotions.length) {
        await store.delete(k);
        return;
      }
      await store.put(k, { key: p.key, emotions } satisfies Entry);
    },

    /** Reads only: no run starts, nothing is written. Unknown numbers are left out. */
    async get(ids: string[]): Promise<OverallView> {
      const books: OverallView["books"] = {};
      for (const id of new Set(ids)) {
        if (!isCatalogId(id)) continue;
        const e = await store.get<Entry>(entryKey(id));
        if (e?.emotions?.length) books[id] = { emotions: e.emotions };
      }
      return { books };
    },
  };
}

/** The LibriVox numbers in a `?ids=1,2,3` query, or an error: digits only, at most OVERALL_MAX_IDS. */
export function parseIds(raw: string | null): { ok: true; ids: string[] } | { ok: false; error: string } {
  const ids = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return { ok: false, error: "ids must list LibriVox catalog numbers" };
  if (ids.length > OVERALL_MAX_IDS) return { ok: false, error: `at most ${OVERALL_MAX_IDS} ids` };
  if (!ids.every(isCatalogId)) return { ok: false, error: "every id must be a LibriVox catalog number (digits)" };
  return { ok: true, ids: [...new Set(ids)] };
}
