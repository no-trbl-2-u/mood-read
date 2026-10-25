// The listener's verdicts on this device (07.4, A5), for the screens: the store bound to the platform's key-value
// backend and its React hook. 07.5 (A6) binds the sender here too (./verdict-sync.ts): it runs when the app starts,
// when a verdict changes and when a setting changes, and its own rules decide whether today's batch goes. Storage is
// reached only through src/lib/ (agents.md rule 7).
import { useSyncExternalStore } from "react";

import { getItem, removeItem, setItem } from "./kv";
import { library } from "./library";
import { network } from "./network";
import { scoringApi, scoringStore } from "./scoring";
import { settings } from "./settings";
import type { PieceVerdict } from "./types";
import { createVerdictStore } from "./verdict-store";
import { createVerdictSync } from "./verdict-sync";

export const verdicts = createVerdictStore({ getItem, setItem, removeItem });

export const verdictSync = createVerdictSync({
  kv: { getItem, setItem, removeItem },
  books: () => library.books(),
  verdicts: (bookId) => verdicts.verdicts(bookId),
  scores: (bookId) => scoringStore.scores(bookId),
  settings: () => settings.get(),
  onWifi: network.onWifi,
  send: (rows) => scoringApi.sendVerdicts(rows),
});

const sync = () => void verdictSync.run();
verdicts.subscribe(sync);
settings.subscribe(sync);
network.subscribe(sync);
sync();

/** Every verdict kept for the book, by chapter then piece. */
export function useBookVerdicts(bookId: string): readonly PieceVerdict[] {
  const read = () => verdicts.verdicts(bookId);
  return useSyncExternalStore(verdicts.subscribe, read, read);
}
