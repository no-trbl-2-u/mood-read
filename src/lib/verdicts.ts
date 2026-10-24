// The listener's verdicts on this device (07.4, A5), for the screens: the store bound to the platform's key-value
// backend and its React hook. Storage is reached only through src/lib/ (agents.md rule 7).
import { useSyncExternalStore } from "react";

import { getItem, removeItem, setItem } from "./kv";
import type { PieceVerdict } from "./types";
import { createVerdictStore } from "./verdict-store";

export const verdicts = createVerdictStore({ getItem, setItem, removeItem });

/** Every verdict kept for the book, by chapter then piece. */
export function useBookVerdicts(bookId: string): readonly PieceVerdict[] {
  const read = () => verdicts.verdicts(bookId);
  return useSyncExternalStore(verdicts.subscribe, read, read);
}
