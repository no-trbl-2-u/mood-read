// The download queue's items on the device (05.6, A6): one JSON record over the same key-value backend the
// library and settings use. Pure: the store is handed its key-value backend, so `node --test` exercises the same
// code the app runs. src/lib/download-queue.ts is what moves a download through its states; screens reach both
// through src/lib/downloads.ts.
import type { Kv } from "./library-store.ts";
import type { Download } from "./types.ts";

const KEY = "downloads";

export function createDownloadStore(kv: Kv) {
  function read(): Download[] {
    try {
      const raw = kv.getItem(KEY);
      const parsed = raw == null ? [] : JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Download[]) : [];
    } catch {
      return [];
    }
  }

  let state: Download[] = read();
  const listeners = new Set<() => void>();

  function save(next: Download[]): void {
    state = next;
    kv.setItem(KEY, JSON.stringify(next));
    listeners.forEach((l) => l());
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    list: (): Download[] => state,
    get: (id: string): Download | undefined => state.find((d) => d.id === id),
    add(download: Download): void {
      save([...state, download]);
    },
    /** Merges a patch into one download by id; a missing id changes nothing. */
    patch(id: string, patch: Partial<Download>): void {
      if (!state.some((d) => d.id === id)) return;
      save(state.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    },
    remove(id: string): void {
      if (!state.some((d) => d.id === id)) return;
      save(state.filter((d) => d.id !== id));
    },
  };
}

export type DownloadStore = ReturnType<typeof createDownloadStore>;
