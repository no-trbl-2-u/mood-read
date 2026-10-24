// The dismissed one-time notes on this device, for the screens: the store bound to the platform's key-value backend
// and its React hook. Storage is reached only through src/lib/ (agents.md rule 7).
import { useSyncExternalStore } from "react";

import { getItem, removeItem, setItem } from "./kv";
import { createNoteStore, type NoteId } from "./notes-store";

export const notes = createNoteStore({ getItem, setItem, removeItem });

export function useNoteDismissed(id: NoteId): boolean {
  const read = () => notes.dismissed(id);
  return useSyncExternalStore(notes.subscribe, read, read);
}
