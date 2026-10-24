// The download queue's real transfer, for the app (05.6, A6): moves a URL's bytes into a file on the device,
// with progress and cancellation, through expo-file-system's download task. Generic over any URL and
// destination; a later chunk resolves a Download's target to one of these once there is something to resolve it
// to (05.1-05.4's music catalog, 05.8's LibriVox browse) — nothing calls this today. Not unit tested, like
// src/lib/media.ts: a thin wrapper over the native module, exercised by hand once it is wired.
import { File, type Directory } from 'expo-file-system';

import type { Transfer } from './download-queue';

/** Builds a `Transfer` that always moves the same URL into the same destination, regardless of which download it is handed. */
export function createFileTransfer(url: string, destination: File | Directory): Transfer {
  return async (_download, onProgress, signal) => {
    await File.downloadFileAsync(url, destination, {
      idempotent: true,
      signal,
      onProgress: (p) => onProgress(p.bytesWritten, p.totalBytes < 0 ? null : p.totalBytes),
    });
  };
}

/** Builds a `Transfer` for a whole queue, resolving each download's target to its own URL and destination. */
export function createResolvingTransfer(resolve: (target: Parameters<Transfer>[0]['target']) => { url: string; destination: File | Directory }): Transfer {
  return (download, onProgress, signal) => {
    const { url, destination } = resolve(download.target);
    return createFileTransfer(url, destination)(download, onProgress, signal);
  };
}
