// Scoring on this device, for the screens (01.2): the runner bound to the scoring proxy's one configured base URL
// (`expo.extra.scoringProxyUrl` in app.json: a public address, not a secret; no key ships in the app, A22) and to the
// same key-value store as the library (agents.md rule 7), plus its React hooks.
import Constants from "expo-constants";
import { useSyncExternalStore } from "react";

import { getItem, removeItem, setItem } from "./kv";
import { createScoringApi } from "./scoring-api";
import { createScoringNoteStore, type ScoringNote } from "./scoring-band";
import { createScoringRunner } from "./scoring-runner";
import { createScoringStore } from "./scoring-store";
import type { BookScores, ScoringJob } from "./types";

/** The proxy's base URL. The placeholder in app.json resolves nowhere (.invalid) until the owner sets the Worker's. */
export const SCORING_PROXY_URL: string = (Constants.expoConfig?.extra?.scoringProxyUrl as string | undefined) ?? "https://mood-read-proxy.invalid";

export const scoringStore = createScoringStore({ getItem, setItem, removeItem });

export const scoring = createScoringRunner({
  api: createScoringApi(SCORING_PROXY_URL, (input, init) => fetch(input, init)),
  store: scoringStore,
});

/** The first-run note's state on this device (01.17): which run carries it, and whether it was dismissed. */
export const scoringNote = createScoringNoteStore({ getItem, setItem, removeItem });

export function useScoringNote(): ScoringNote {
  return useSyncExternalStore(scoringNote.subscribe, scoringNote.get, scoringNote.get);
}

export function useScoringJob(bookId: string): ScoringJob | null {
  const read = () => scoringStore.job(bookId);
  return useSyncExternalStore(scoringStore.subscribe, read, read);
}

export function useBookScores(bookId: string): BookScores | null {
  const read = () => scoringStore.scores(bookId);
  return useSyncExternalStore(scoringStore.subscribe, read, read);
}
