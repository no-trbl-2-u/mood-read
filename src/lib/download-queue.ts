// The download queue's engine (05.6, A6): queued -> running -> done, or paused and resumed in place, or failed
// with a retry that backs off. What actually moves bytes is injected (`Transfer`), so this file never touches the
// network or the filesystem: tests hand it a fake, src/lib/download-transfer.ts hands the app a real one once a
// later chunk (05.1-05.4, 05.8) has a source to resolve a target to. Pure: the store, the clock and the timer are
// handed in too, following src/lib/scoring-runner.ts's shape.
import type { DownloadStore } from "./download-store.ts";
import { newId } from "./timeline.ts";
import type { Download, DownloadTarget } from "./types.ts";

/** Moves one download's bytes: reports progress as it learns them, and stops the moment `signal` aborts. */
export type Transfer = (
  download: Download,
  onProgress: (bytes: number, totalBytes: number | null) => void,
  signal: AbortSignal,
) => Promise<void>;

type Timers = { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * How long the queue waits before trying a failed download again on its own, by how many times in a row it has
 * failed: four tries at increasing gaps, then every minute (the Downloads screen's line, "it tries again on its
 * own in a minute", design/layouts/DECISION.md). An explicit Retry skips the wait but does not reset the count,
 * so a download that keeps failing still settles onto the one-minute rhythm.
 */
export const RETRY_BACKOFF_MS = [1_000, 5_000, 15_000, 60_000];

/**
 * How long a running transfer may go without a single progress report before the queue gives up on it (A25). A
 * hung native transfer never fails by itself and would sit "running" forever; past this it is aborted and failed,
 * and the backoff above retries it. A default (one minute): long enough for a slow archive.org redirect, short
 * enough that a dead connection does not look alive.
 */
export const STALL_MS = 60_000;

export function backoffMs(attempts: number): number {
  const i = Math.min(Math.max(attempts, 1), RETRY_BACKOFF_MS.length) - 1;
  return RETRY_BACKOFF_MS[i];
}

export function createDownloadQueue(deps: {
  store: DownloadStore;
  transfer: Transfer;
  /** Whether downloads wait for Wi-Fi (settings.wifiOnly, 06.3; on by default). */
  wifiOnly: () => boolean;
  /**
   * Whether the device is on Wi-Fi right now. The app binds this to the network watch (./network.ts); left out,
   * it always says yes, so Wi-Fi-only gates on the setting alone. Tests inject `false` to exercise the gate itself.
   */
  onWifi?: () => boolean;
  now?: () => number;
  timers?: Timers;
  /** The stall window (A25); tests shorten it. */
  stallMs?: number;
  makeId?: () => string;
}) {
  const now = deps.now ?? Date.now;
  const timers = deps.timers ?? realTimers;
  const onWifi = deps.onWifi ?? (() => true);
  const makeId = deps.makeId ?? newId;
  const stallMs = deps.stallMs ?? STALL_MS;
  const { store, transfer, wifiOnly } = deps;

  const controllers = new Map<string, AbortController>();
  const retries = new Map<string, unknown>();

  function wakeAll(): void {
    for (const d of store.list()) if (d.state === "queued") maybeStart(d.id);
  }

  function clearRetry(id: string): void {
    const h = retries.get(id);
    if (h !== undefined) timers.clear(h);
    retries.delete(id);
  }

  function scheduleRetry(id: string, attempts: number): void {
    clearRetry(id);
    retries.set(
      id,
      timers.set(() => {
        retries.delete(id);
        if (store.get(id)?.state !== "failed") return;
        store.patch(id, { state: "queued", error: null, updatedAt: now() });
        maybeStart(id);
      }, backoffMs(attempts)),
    );
  }

  function maybeStart(id: string): void {
    const d = store.get(id);
    if (!d || d.state !== "queued") return;
    if (wifiOnly() && !onWifi()) return; // stays queued; the screen explains why
    void run(id);
  }

  function failed(id: string, message: string): void {
    const after = store.get(id);
    if (!after) return;
    const attempts = after.attempts + 1;
    store.patch(id, { state: "failed", attempts, error: message, updatedAt: now() });
    scheduleRetry(id, attempts);
  }

  async function run(id: string): Promise<void> {
    const controller = new AbortController();
    controllers.set(id, controller);
    store.patch(id, { state: "running", error: null, updatedAt: now() });
    // The stall guard (A25): any progress report re-arms it; silence for `stallMs` aborts the transfer and fails it.
    let watchdog: unknown;
    const disarm = () => {
      if (watchdog !== undefined) timers.clear(watchdog);
      watchdog = undefined;
    };
    const arm = () => {
      disarm();
      watchdog = timers.set(() => {
        watchdog = undefined;
        if (controller.signal.aborted) return;
        controller.abort();
        if (controllers.get(id) === controller) controllers.delete(id);
        failed(id, `No progress for ${Math.round(stallMs / 1000)} seconds, so this download was stopped. It will try again.`);
      }, stallMs);
    };
    try {
      const current = store.get(id);
      if (!current) return;
      arm();
      await transfer(
        current,
        (bytes, totalBytes) => {
          if (controller.signal.aborted) return; // a late report from a run that was stopped
          store.patch(id, { bytes, totalBytes, updatedAt: now() });
          arm();
        },
        controller.signal,
      );
      if (controller.signal.aborted) return; // paused, removed or stalled mid-transfer: that call already settled its state
      store.patch(id, { state: "done", updatedAt: now() });
    } catch (e) {
      if (controller.signal.aborted) return;
      failed(id, e instanceof Error ? e.message : String(e));
    } finally {
      disarm();
      if (controllers.get(id) === controller) controllers.delete(id);
    }
  }

  return {
    /** Adds a book or a piece to the queue and starts it at once, unless Wi-Fi-only holds it back. */
    enqueue(target: DownloadTarget): Download {
      const download: Download = {
        id: makeId(),
        target,
        state: "queued",
        bytes: 0,
        totalBytes: null,
        error: null,
        attempts: 0,
        queuedAt: now(),
        updatedAt: now(),
      };
      store.add(download);
      maybeStart(download.id);
      return download;
    },
    pause(id: string): void {
      const d = store.get(id);
      if (!d || d.state !== "running") return;
      store.patch(id, { state: "paused", updatedAt: now() });
      controllers.get(id)?.abort();
      controllers.delete(id);
    },
    resume(id: string): void {
      const d = store.get(id);
      if (!d || d.state !== "paused") return;
      store.patch(id, { state: "queued", updatedAt: now() });
      maybeStart(id);
    },
    /** Tries a failed download again right away; keeps its attempt count, so repeated failures still back off. */
    retry(id: string): void {
      clearRetry(id);
      const d = store.get(id);
      if (!d || d.state !== "failed") return;
      store.patch(id, { state: "queued", error: null, updatedAt: now() });
      maybeStart(id);
    },
    remove(id: string): void {
      clearRetry(id);
      controllers.get(id)?.abort();
      controllers.delete(id);
      store.remove(id);
    },
    /** Gives every still-queued download another chance to start (Wi-Fi came back, or the setting changed). */
    wake: wakeAll,
  };
}

// A download left `running` when the app closed has no live transfer behind it any more (its AbortController
// died with the process): queue it again so it can resume, rather than sitting stuck as "running" forever.
// Exported so src/lib/downloads.ts can run it once, against the real store, before the app's own queue is built.
export function recoverRunning(store: DownloadStore, now: () => number = Date.now): void {
  for (const d of store.list()) if (d.state === "running") store.patch(d.id, { state: "queued", updatedAt: now() });
}

export type DownloadQueue = ReturnType<typeof createDownloadQueue>;
