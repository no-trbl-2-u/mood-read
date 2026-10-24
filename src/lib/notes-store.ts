// One-time notes the listener has dismissed on this device (01.17, A30): the scoring band's first-run line shows
// until its dismiss button is pressed, then never again, on any book. Pure over the key-value backend, so `node
// --test` exercises the code the app runs. Screens reach it through ./notes.ts.
import type { Kv } from "./library-store.ts";

export type NoteId = "scoring-sent";

const key = (id: NoteId) => `note-dismissed:${id}`;

export function createNoteStore(kv: Kv) {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dismissed: (id: NoteId): boolean => kv.getItem(key(id)) === "1",
    dismiss(id: NoteId): void {
      if (kv.getItem(key(id)) === "1") return;
      kv.setItem(key(id), "1");
      listeners.forEach((l) => l());
    },
  };
}

export type NoteStore = ReturnType<typeof createNoteStore>;
