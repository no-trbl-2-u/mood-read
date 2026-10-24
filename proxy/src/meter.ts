// The spend meter and the monthly cap (01.2, Open questions 6, A22). Every paid call (an OpenAI completion, a Brave
// query) adds its cost to the current UTC month; a new research run starts only while that month's spend is under
// the cap. A run already going finishes (its chapters are half paid for); books already cached always return.
// The cap is one config value, MONTHLY_CAP_USD in proxy/wrangler.jsonc, so it changes without a rebuild.
import type { Store } from "./store.ts";

export const DEFAULT_CAP_USD = 20;

/** US dollars per million tokens, input and output, by model. An unknown model is priced high on purpose. */
export const OPENAI_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
};
export const UNKNOWN_MODEL_PRICE = { input: 5, output: 20 };

/** One Brave Search web query, in US dollars. */
export const BRAVE_USD_PER_QUERY = 0.005;

export function openAiCost(model: string, usage: { input: number; output: number }): number {
  const p = OPENAI_PRICES[model] ?? UNKNOWN_MODEL_PRICE;
  return (usage.input * p.input + usage.output * p.output) / 1_000_000;
}

/** The meter's month for a time: "YYYY-MM" in UTC. */
export function monthOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

/** Reads MONTHLY_CAP_USD; missing, unparsable or negative falls back to the default $20. */
export function capFrom(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_CAP_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CAP_USD;
}

/**
 * The meter. `spent(month)` is the month's whole spend, every run's; a `bucket` (05.10: "prescore") also tallies a
 * share of it on its own, so `spent(month, bucket)` is that share alone. An add with a bucket counts in both.
 */
export type Meter = {
  spent(month: string, bucket?: string): Promise<number>;
  add(month: string, usd: number, bucket?: string): Promise<void>;
};

const spendKey = (month: string, bucket?: string) => (bucket ? `spend:${bucket}:${month}` : `spend:${month}`);

/** The meter over a Store (in production, the SpendMeter object's storage: one writer, so adds never race). */
export function createMeter(store: Store): Meter {
  return {
    async spent(month, bucket) {
      return (await store.get<number>(spendKey(month, bucket))) ?? 0;
    },
    async add(month, usd, bucket) {
      if (!Number.isFinite(usd) || usd <= 0) return;
      const now = (await store.get<number>(spendKey(month))) ?? 0;
      await store.put(spendKey(month), now + usd);
      if (bucket) await store.put(spendKey(month, bucket), ((await store.get<number>(spendKey(month, bucket))) ?? 0) + usd);
    },
  };
}

/** True when a new research run may start this month. */
export async function underCap(meter: Meter, capUsd: number, nowMs: number): Promise<boolean> {
  return (await meter.spent(monthOf(nowMs))) < capUsd;
}

/** Output tokens assumed for a failed model call that reported no usage: a full answer, high on purpose. */
export const FAILED_CALL_OUTPUT_TOKENS = 4000;

/**
 * A conservative token count for a failed model call whose provider reported none (01.21): the request at about
 * three characters a token in, FAILED_CALL_OUTPUT_TOKENS out. Over-counting only brings the cap closer; a failure
 * that went uncounted could let the real spend pass it.
 */
export function estimateUsage(req: { system: string; user: string; schema: unknown }): { input: number; output: number } {
  const chars = req.system.length + req.user.length + JSON.stringify(req.schema ?? null).length;
  return { input: Math.ceil(chars / 3), output: FAILED_CALL_OUTPUT_TOKENS };
}
