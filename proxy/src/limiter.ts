// Limits on new scoring runs (01.21, A34): a caller cannot spend the monthly budget with made-up books or repeated
// rescores. Only a request that would start a new research run is counted (job.ts decides that): a cached book, or a
// run already going, never counts. Each new run must pass two ceilings for the current hour: one per client and one
// across every client. Rescoring a cached book also waits until its result is a minimum age (job.ts).
//
// The proxy keeps no listener data (agents.md rule 6). A client is the connection's address (cf-connecting-ip),
// and it is held only as a SHA-256 hash salted with a random value made for the current hour's window. The window
// (its salt, its hashes and their counts) is the only thing stored, it is replaced when the next hour starts and
// deleted when its hour ends (index.ts's RateLimiter alarm), so a hash cannot be linked to an address after it.
// The address itself is never stored and nothing here logs. The limiter knows nothing of books or of the model.
//
// The limits are config values in proxy/wrangler.jsonc (RUNS_PER_CLIENT_PER_HOUR, RUNS_PER_HOUR,
// RESCORE_MIN_AGE_DAYS); a missing or unparsable value falls back to the default here.
import type { Store } from "./store.ts";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export const DEFAULT_RUNS_PER_CLIENT_PER_HOUR = 3;
export const DEFAULT_RUNS_PER_HOUR = 30;
export const DEFAULT_RESCORE_MIN_AGE_DAYS = 7;

export type RunLimits = { perClient: number; global: number; windowMs: number };

export type RefusalReason = "rescore-too-soon" | "client-limit" | "global-limit";
/** Why a start was refused, and how long until it may be asked again. */
export type Refusal = { reason: RefusalReason; retryAfterMs: number };
export type Admission = { ok: true } | ({ ok: false } & Refusal);

export type Limiter = {
  /** Counts one new run for this client if both ceilings allow it; a refusal counts nothing. */
  admit(client: string, nowMs: number): Promise<Admission>;
};

/** The client a request with no address counts as (Cloudflare always sends one; local runs may not). */
export const UNKNOWN_CLIENT = "unknown";

function wholeCount(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function limitsFrom(env: { RUNS_PER_CLIENT_PER_HOUR?: string; RUNS_PER_HOUR?: string }): RunLimits {
  return {
    perClient: wholeCount(env.RUNS_PER_CLIENT_PER_HOUR, DEFAULT_RUNS_PER_CLIENT_PER_HOUR),
    global: wholeCount(env.RUNS_PER_HOUR, DEFAULT_RUNS_PER_HOUR),
    windowMs: HOUR_MS,
  };
}

/** RESCORE_MIN_AGE_DAYS in milliseconds; missing, unparsable or negative falls back to 7 days. */
export function rescoreMinAgeFrom(raw: string | undefined): number {
  const days = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return (Number.isFinite(days) && days >= 0 ? days : DEFAULT_RESCORE_MIN_AGE_DAYS) * DAY_MS;
}

/** A Retry-After header's value: whole seconds, at least one. */
export function retryAfterSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

type Window = { id: number; salt: string; total: number; clients: Record<string, number> };
const WINDOW = "window";

function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashClient(salt: string, client: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}\n${client}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/**
 * The limiter over a Store: in production the RateLimiter object's storage (index.ts), one writer, so counts never
 * race; in tests memoryStore().
 */
export function createRateLimiter(store: Store, limits: RunLimits, salt: () => string = randomSalt) {
  const windowOf = (nowMs: number) => Math.floor(nowMs / limits.windowMs);
  const windowEnd = (nowMs: number) => (windowOf(nowMs) + 1) * limits.windowMs;

  return {
    windowEnd,

    async admit(client: string, nowMs: number): Promise<Admission> {
      const id = windowOf(nowMs);
      const retryAfterMs = windowEnd(nowMs) - nowMs;
      let w = await store.get<Window>(WINDOW);
      // A window from an earlier hour is replaced whole: its salt and hashes go with it.
      if (!w || w.id !== id) w = { id, salt: salt(), total: 0, clients: {} };
      if (w.total >= limits.global) return { ok: false, reason: "global-limit", retryAfterMs };
      const tag = await hashClient(w.salt, client);
      const used = w.clients[tag] ?? 0;
      if (used >= limits.perClient) return { ok: false, reason: "client-limit", retryAfterMs };
      w.clients[tag] = used + 1;
      w.total += 1;
      await store.put(WINDOW, w);
      return { ok: true };
    },

    /** Deletes the stored window once its hour has ended. */
    async expire(nowMs: number): Promise<void> {
      const w = await store.get<Window>(WINDOW);
      if (w && w.id < windowOf(nowMs)) await store.delete(WINDOW);
    },
  };
}
