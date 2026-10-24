// A small per-client rate limiter for POST /v1/verdicts (07.5, spec 07 A6). 01.21 will rate-limit /v1/score and
// /v1/rescore; until it lands this endpoint carries its own, behind the Limiter seam, so 01.21's limiter can replace
// it by implementing `take` (http.ts asks nothing else of it). /v1/score is untouched.
//
// A client is the address Cloudflare reports for the connection (`cf-connecting-ip`). The limiter holds only a salted
// hash of it, in memory, for the current window: never in storage, never logged, and the salt is this instance's own
// random value, so a hash names no address outside it (the privacy policy: the proxy keeps no record of who asked).
// In production it lives in the VerdictCounts object's memory (index.ts), one instance for every request; if the
// object is evicted the counts start again, which only ever lets a client through, never locks one out.

export type Limiter = {
  /** True when this client may make one more request now (and counts it); false when it is over its limit. */
  take(client: string): Promise<boolean>;
};

/** At most this many verdict posts per client per window: the app sends one a day, so this is generous. */
export const VERDICT_RATE = { max: 10, windowMs: 60 * 60 * 1000 } as const;

/** The client a request comes from, for a Limiter: Cloudflare's connecting address, or "" when there is none (tests). */
export const clientOf = (request: Request): string => request.headers.get("cf-connecting-ip") ?? "";

/** A fixed-window limiter in memory: `max` requests per client per `windowMs`. */
export function memoryLimiter(opts: { max: number; windowMs: number } = VERDICT_RATE, now: () => number = Date.now): Limiter {
  const salt = crypto.getRandomValues(new Uint8Array(16)).join(".");
  let window = -1;
  let counts = new Map<string, number>();
  const hash = async (client: string) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${client}`));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  return {
    async take(client) {
      const w = Math.floor(now() / opts.windowMs);
      if (w !== window) {
        window = w;
        counts = new Map();
      }
      const key = await hash(client);
      const n = counts.get(key) ?? 0;
      if (n >= opts.max) return false;
      counts.set(key, n + 1);
      return true;
    },
  };
}
