// The scoring job from the app's side (01.2, A13, A15): start it, remember its id per book, poll it while the app is
// open, and pick it up again after a restart. The work itself runs on the proxy, so it carries on while the app is
// closed. Playback never waits on any of this: an unscored chapter plays as it always did.
// Pure: the api, the store, the clock and the timer are handed in.
import type { ScoringApi } from "./scoring-api.ts";
import { toBookScores, type ScoringStore } from "./scoring-store.ts";
import type { Book, JobView, ScoringJob } from "./types.ts";

export const POLL_MS = 3000;
/** Polls back off to this while the proxy cannot be reached. */
export const MAX_POLL_MS = 60_000;

type Timers = { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };

const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

export function createScoringRunner(deps: { api: ScoringApi; store: ScoringStore; now?: () => number; timers?: Timers; pollMs?: number }) {
  const now = deps.now ?? Date.now;
  const timers = deps.timers ?? realTimers;
  const pollMs = deps.pollMs ?? POLL_MS;
  const { api, store } = deps;
  const polls = new Map<string, unknown>();
  const failures = new Map<string, number>();

  function stopPolling(bookId: string) {
    const h = polls.get(bookId);
    if (h !== undefined) timers.clear(h);
    polls.delete(bookId);
  }

  function schedule(book: Book, ms: number) {
    stopPolling(book.id);
    polls.set(
      book.id,
      timers.set(() => {
        polls.delete(book.id);
        void poll(book);
      }, ms),
    );
  }

  /** Records what the proxy said; a finished job's chapters are stored and the job forgotten. */
  function apply(book: Book, view: JobView, rescore: boolean) {
    const prev = store.job(book.id);
    if (view.state === "done") {
      const scores = toBookScores(book, view, store.scores(book.id));
      if (scores) store.saveScores(book.id, scores);
      store.saveJob(book.id, null);
      return;
    }
    const job: ScoringJob = {
      jobId: view.jobId,
      state: view.state,
      progress: view.progress,
      rescore,
      startedAt: prev?.startedAt ?? now(),
      updatedAt: now(),
    };
    store.saveJob(book.id, job);
    // Running: keep polling. Capped: the proxy starts it by itself next month; a poll now and then finds out.
    if (view.state === "running") schedule(book, pollMs);
    else if (view.state === "capped") schedule(book, MAX_POLL_MS);
  }

  function unreachable(book: Book, rescore: boolean) {
    const prev = store.job(book.id);
    store.saveJob(book.id, {
      jobId: prev?.jobId ?? null,
      state: "unreachable",
      progress: prev?.progress ?? { step: 0, steps: 0, chaptersDone: 0, chapters: book.chapters.length },
      rescore,
      startedAt: prev?.startedAt ?? now(),
      updatedAt: now(),
    });
  }

  async function poll(book: Book): Promise<void> {
    const job = store.job(book.id);
    if (!job?.jobId) return;
    try {
      const view = await api.status(job.jobId);
      failures.delete(book.id);
      // The proxy forgot the job (a redeploy, say): start it again, which returns its cache if it has one.
      if (!view) return void (await start(book, job.rescore));
      apply(book, view, job.rescore);
    } catch {
      // Offline for a moment: the job lives on at the proxy, so keep its id and try again, more slowly each time.
      const n = (failures.get(book.id) ?? 0) + 1;
      failures.set(book.id, n);
      schedule(book, Math.min(MAX_POLL_MS, pollMs * 2 ** n));
    }
  }

  async function start(book: Book, rescore = false): Promise<void> {
    stopPolling(book.id);
    try {
      apply(book, await api.start(book, rescore), rescore);
    } catch {
      unreachable(book, rescore);
    }
  }

  return {
    start,
    /** Picks a remembered job up again: after a restart, or when its book opens. */
    resume(book: Book): void {
      const job = store.job(book.id);
      if (!job?.jobId || polls.has(book.id)) return;
      if (job.state === "running" || job.state === "capped" || job.state === "unreachable") void poll(book);
    },
    resumeAll(books: Book[]): void {
      for (const b of books) this.resume(b);
    },
    stop: stopPolling,
    isPolling: (bookId: string) => polls.has(bookId),
  };
}

export type ScoringRunner = ReturnType<typeof createScoringRunner>;
