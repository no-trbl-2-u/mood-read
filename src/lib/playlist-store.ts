// Which books built a playlist on this device, and the pieces each holds (spec 05, 05.4, A4, A5; A8's reference rule
// reads it): one JSON record over the same key-value backend as the library, reached only through src/lib/ (agents.md
// rule 7). Pure: the backend is handed in, so `node --test` runs the code the app runs.
import type { Kv } from "./library-store.ts";
import type { PlaylistRecord } from "./playlist.ts";

const KEY = "playlists";

function valid(x: unknown): x is PlaylistRecord {
  if (!x || typeof x !== "object") return false;
  const r = x as Partial<PlaylistRecord>;
  return (
    typeof r.bookId === "string" &&
    typeof r.builtAt === "number" &&
    Array.isArray(r.pieces) &&
    r.pieces.every((p) => !!p && typeof p.id === "string" && typeof p.key === "string")
  );
}

export function createPlaylistStore(kv: Kv) {
  function read(): PlaylistRecord[] {
    try {
      const raw = kv.getItem(KEY);
      const parsed: unknown = raw == null ? [] : JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(valid) : [];
    } catch {
      return [];
    }
  }

  let state: PlaylistRecord[] = read();
  const listeners = new Set<() => void>();

  function save(next: PlaylistRecord[]): void {
    state = next;
    if (next.length === 0) kv.removeItem(KEY);
    else kv.setItem(KEY, JSON.stringify(next));
    listeners.forEach((l) => l());
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    list: (): PlaylistRecord[] => state,
    get: (bookId: string): PlaylistRecord | null => state.find((r) => r.bookId === bookId) ?? null,
    /** Keeps the book's record, replacing any it had. */
    put(record: PlaylistRecord): void {
      save([...state.filter((r) => r.bookId !== record.bookId), record]);
    },
    remove(bookId: string): void {
      if (!state.some((r) => r.bookId === bookId)) return;
      save(state.filter((r) => r.bookId !== bookId));
    },
  };
}

export type PlaylistStore = ReturnType<typeof createPlaylistStore>;
