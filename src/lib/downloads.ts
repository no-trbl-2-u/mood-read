// The download queue on this device, for the screens: the store and engine bound to the platform's key-value
// backend, Wi-Fi-only from the listener's settings (06.3), and the storage meter. Storage is reached only through
// src/lib/ (agents.md rule 7).
import { useSyncExternalStore } from "react";

import { createDownloadQueue, recoverRunning, type Transfer } from "./download-queue";
import { createDownloadStore } from "./download-store";
import { getItem, removeItem, setItem } from "./kv";
import { useBooks } from "./library";
import { settings } from "./settings";
import { booksStorageBytes } from "./storage-size";
import { musicBytesFrom, type StorageMeter } from "./storage";
import type { Download } from "./types";

export const downloadStore = createDownloadStore({ getItem, setItem, removeItem });

// A download left "running" the last time the app closed has no live transfer behind it any more; queue it
// again before anything else touches the store, so it resumes instead of sitting stuck (A6).
recoverRunning(downloadStore);

/**
 * No chunk has a real download source yet (05.1-05.4 the music catalog, 05.8 LibriVox browse), so nothing ever
 * calls `enqueue` today and this transfer never runs. It is here so the queue is wired for real, ready for
 * those chunks to hand it a resolver (src/lib/download-transfer.ts builds the real one once they do).
 */
const noSourceYet: Transfer = () => Promise.reject(new Error("No download source for this item yet"));

export const downloadQueue = createDownloadQueue({
  store: downloadStore,
  transfer: noSourceYet,
  wifiOnly: () => settings.get().wifiOnly,
});

// Kicks off anything left queued (including what recoverRunning just requeued). Wi-Fi-only turning off, or
// Wi-Fi itself returning once a later chunk wires that check in, should let a held-back download start on its
// own too, without the listener having to touch it again.
downloadQueue.wake();
settings.subscribe(() => downloadQueue.wake());

export function useDownloads(): Download[] {
  return useSyncExternalStore(downloadStore.subscribe, downloadStore.list, downloadStore.list);
}

/** Books' bytes from the device's imported files, and music's from the queue's finished pieces (A6). */
export function useStorageMeter(): StorageMeter {
  const books = useBooks();
  const downloads = useDownloads();
  return { booksBytes: booksStorageBytes(books), musicBytes: musicBytesFrom(downloads) };
}
