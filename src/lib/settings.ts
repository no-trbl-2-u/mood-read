// The listener's settings on this device, for the screens: the store bound to the platform's key-value backend
// and its React hook. Storage is reached only through src/lib/ (agents.md rule 7).
import { useSyncExternalStore } from "react";

import { getItem, removeItem, setItem } from "./kv";
import { createSettingsStore } from "./settings-store";
import type { Settings } from "./types";

export { DEFAULT_SETTINGS, SOUNDSCAPE_OFF } from "./settings-store";

export const settings = createSettingsStore({ getItem, setItem, removeItem });

export function useSettings(): Settings {
  return useSyncExternalStore(settings.subscribe, settings.get, settings.get);
}
