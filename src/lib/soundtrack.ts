// "Your soundtrack" on this device (07.8, A9), for the screens: the store bound to the platform's key-value backend,
// its React hook, and the list it shows. Storage is reached only through src/lib/ (agents.md rule 7).
import { useSyncExternalStore } from "react";

import { getItem, removeItem, setItem } from "./kv";
import { useBooks } from "./library";
import { scoringStore } from "./scoring";
import { createSoundtrackStore, soundtrackView, type SoundtrackGroup } from "./soundtrack-store";
import type { SoundtrackEntry } from "./types";

export const soundtrack = createSoundtrackStore({ getItem, setItem, removeItem });

export function useSoundtrackEntries(): readonly SoundtrackEntry[] {
  return useSyncExternalStore(soundtrack.subscribe, soundtrack.entries, soundtrack.entries);
}

/** Every piece that has played, grouped by book on the shelf, with titles and artists from the stored scores. */
export function useSoundtrack(): SoundtrackGroup[] {
  const entries = useSoundtrackEntries();
  const books = useBooks();
  // Titles are read as the list renders: scores do not change while this screen is open (a rescore runs from a river).
  // A listener's matched piece (07.6) is read from the book's chapters as the river reads them.
  return soundtrackView(entries, books, (id) => ({ chapters: scoringStore.chapters(id) }));
}
