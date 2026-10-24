import assert from "node:assert/strict";
import { test } from "node:test";

import { backoffMs, createDownloadQueue, recoverRunning, RETRY_BACKOFF_MS, type Transfer } from "./download-queue.ts";
import { createDownloadStore } from "./download-store.ts";
import type { Kv } from "./library-store.ts";

function memoryKv(): Kv & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** Fires every pending timer at once, like src/lib/scoring-runner.test.ts's. */
function manualTimers() {
  const queue = new Map<number, { fn: () => void; ms: number }>();
  let id = 0;
  return {
    queue,
    set: (fn: () => void, ms: number) => {
      queue.set(++id, { fn, ms });
      return id;
    },
    clear: (h: unknown) => void queue.delete(h as number),
    async fire() {
      const all = [...queue.entries()];
      queue.clear();
      for (const [, t] of all) t.fn();
      await flush();
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

const BOOK = { kind: "book" as const, bookId: "b1" };

test("backoffMs follows the documented schedule, then settles on a minute", () => {
  assert.deepEqual(RETRY_BACKOFF_MS, [1_000, 5_000, 15_000, 60_000]);
  assert.equal(backoffMs(1), 1_000);
  assert.equal(backoffMs(2), 5_000);
  assert.equal(backoffMs(3), 15_000);
  assert.equal(backoffMs(4), 60_000);
  assert.equal(backoffMs(10), 60_000);
  assert.equal(backoffMs(0), 1_000);
});

test("A6: a queued download starts at once, reports progress, and finishes done", async () => {
  const store = createDownloadStore(memoryKv());
  const transfer: Transfer = async (_d, onProgress) => {
    onProgress(50, 100);
    onProgress(100, 100);
  };
  const queue = createDownloadQueue({ store, transfer, wifiOnly: () => false, makeId: () => "d1" });
  const d = queue.enqueue(BOOK);
  assert.equal(store.get(d.id)?.state, "running"); // started synchronously, before the transfer's first await
  await flush();
  assert.equal(store.get(d.id)?.state, "done");
  assert.equal(store.get(d.id)?.bytes, 100);
  assert.equal(store.get(d.id)?.totalBytes, 100);
});

test("A6: running pauses, and resuming restarts the transfer from a clean call", async () => {
  const store = createDownloadStore(memoryKv());
  let calls = 0;
  const resolvers: (() => void)[] = [];
  const transfer: Transfer = (_d, onProgress, signal) =>
    new Promise((resolve, reject) => {
      calls++;
      onProgress(10, 100);
      signal.addEventListener("abort", () => reject(new DOMException("paused", "AbortError")));
      resolvers.push(resolve);
    });
  const queue = createDownloadQueue({ store, transfer, wifiOnly: () => false, makeId: () => "d1" });
  const d = queue.enqueue(BOOK);
  await flush();
  assert.equal(store.get(d.id)?.state, "running");
  assert.equal(calls, 1);

  queue.pause(d.id);
  await flush();
  assert.equal(store.get(d.id)?.state, "paused");

  queue.resume(d.id);
  await flush();
  assert.equal(store.get(d.id)?.state, "running");
  assert.equal(calls, 2);

  resolvers[1]();
  await flush();
  assert.equal(store.get(d.id)?.state, "done");
});

test("A6: removing a running download aborts its transfer and drops it from the queue", async () => {
  const store = createDownloadStore(memoryKv());
  let aborted = false;
  const transfer: Transfer = (_d, _onProgress, signal) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        reject(new DOMException("removed", "AbortError"));
      });
    });
  const queue = createDownloadQueue({ store, transfer, wifiOnly: () => false, makeId: () => "d1" });
  const d = queue.enqueue(BOOK);
  await flush();
  assert.equal(store.get(d.id)?.state, "running");

  queue.remove(d.id);
  await flush();
  assert.equal(aborted, true);
  assert.equal(store.get(d.id), undefined);
});

test("A6: a failed download retries on its own, backing off, and keeps counting its attempts", async () => {
  const store = createDownloadStore(memoryKv());
  const timers = manualTimers();
  let attempt = 0;
  const transfer: Transfer = async () => {
    attempt++;
    throw new Error("the connection dropped");
  };
  const queue = createDownloadQueue({ store, transfer, wifiOnly: () => false, timers, makeId: () => "d1" });
  const d = queue.enqueue(BOOK);
  await flush();
  assert.equal(store.get(d.id)?.state, "failed");
  assert.equal(store.get(d.id)?.attempts, 1);
  assert.equal(store.get(d.id)?.error, "the connection dropped");
  assert.equal([...timers.queue.values()][0].ms, backoffMs(1));

  await timers.fire();
  assert.equal(attempt, 2);
  assert.equal(store.get(d.id)?.state, "failed");
  assert.equal(store.get(d.id)?.attempts, 2);
  assert.equal([...timers.queue.values()][0].ms, backoffMs(2));
});

test("A6: an explicit retry skips the wait, and a success afterwards leaves the attempt count as it was", async () => {
  const store = createDownloadStore(memoryKv());
  const timers = manualTimers();
  let fail = true;
  const transfer: Transfer = async () => {
    if (fail) throw new Error("boom");
  };
  const queue = createDownloadQueue({ store, transfer, wifiOnly: () => false, timers, makeId: () => "d1" });
  const d = queue.enqueue(BOOK);
  await flush();
  assert.equal(store.get(d.id)?.attempts, 1);

  fail = false;
  queue.retry(d.id);
  await flush();
  assert.equal(store.get(d.id)?.state, "done");
  assert.equal(store.get(d.id)?.attempts, 1);
});

test("A6: Wi-Fi-only holds a queued download back off Wi-Fi, and wake() starts it once back on", async () => {
  const store = createDownloadStore(memoryKv());
  let onWifi = false;
  let calls = 0;
  const transfer: Transfer = async () => {
    calls++;
  };
  const queue = createDownloadQueue({ store, transfer, wifiOnly: () => true, onWifi: () => onWifi, makeId: () => "d1" });
  const d = queue.enqueue(BOOK);
  await flush();
  assert.equal(store.get(d.id)?.state, "queued");
  assert.equal(calls, 0);

  onWifi = true;
  queue.wake();
  await flush();
  assert.equal(store.get(d.id)?.state, "done");
  assert.equal(calls, 1);
});

test("A6: Wi-Fi-only on by default does not hold anything back once the setting is off", async () => {
  const store = createDownloadStore(memoryKv());
  let calls = 0;
  const transfer: Transfer = async () => {
    calls++;
  };
  const queue = createDownloadQueue({ store, transfer, wifiOnly: () => false, onWifi: () => false, makeId: () => "d1" });
  const d = queue.enqueue(BOOK);
  await flush();
  assert.equal(store.get(d.id)?.state, "done");
  assert.equal(calls, 1);
});

test("A6: a download left running across a restart queues again, so it can resume rather than sitting stuck", async () => {
  const store = createDownloadStore(memoryKv());
  store.add({ id: "d1", target: BOOK, state: "running", bytes: 40, totalBytes: 100, error: null, attempts: 0, queuedAt: 0, updatedAt: 0 });
  store.add({ id: "d2", target: BOOK, state: "done", bytes: 100, totalBytes: 100, error: null, attempts: 0, queuedAt: 0, updatedAt: 0 });

  recoverRunning(store, () => 5000);
  assert.equal(store.get("d1")?.state, "queued");
  assert.equal(store.get("d1")?.updatedAt, 5000);
  assert.equal(store.get("d1")?.bytes, 40); // its progress so far is kept, even though nothing resumes it from there
  assert.equal(store.get("d2")?.state, "done"); // untouched: it was not stuck

  let calls = 0;
  const transfer: Transfer = async () => {
    calls++;
  };
  const queue = createDownloadQueue({ store, transfer, wifiOnly: () => false });
  queue.wake();
  await flush();
  assert.equal(store.get("d1")?.state, "done");
  assert.equal(calls, 1);
});

test("pause, resume and retry do nothing to a download that is not in the matching state", async () => {
  const store = createDownloadStore(memoryKv());
  const transfer: Transfer = async () => {};
  const queue = createDownloadQueue({ store, transfer, wifiOnly: () => false, makeId: () => "d1" });
  const d = queue.enqueue(BOOK);
  await flush();
  assert.equal(store.get(d.id)?.state, "done");

  queue.pause(d.id);
  queue.resume(d.id);
  queue.retry(d.id);
  await flush();
  assert.equal(store.get(d.id)?.state, "done");
});
