// The listener's settings on the device (spec 06, 06.3, A3): one JSON record over the same key-value backend
// the library uses (expo-sqlite's kv-store on native, localStorage on web, a Map in tests). Pure, so `node
// --test` exercises the code the app runs. Screens reach it through ./settings.ts.
import type { Kv } from "./library-store.ts";
import type { Settings } from "./types.ts";

/** The default soundscape value that means no bed at all. */
export const SOUNDSCAPE_OFF = "off";

export const DEFAULT_SETTINGS: Settings = { wifiOnly: true, companionMode: false, companionTimer: false, defaultSoundscapeId: null };

const KEY = "settings";

/** A saved record, read field by field: anything missing or of the wrong type takes its default. */
export function parseSettings(raw: string | null): Settings {
  let value: unknown;
  try {
    value = raw == null ? null : JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_SETTINGS;
  const v = value as Record<string, unknown>;
  const soundscape = v.defaultSoundscapeId;
  return {
    wifiOnly: typeof v.wifiOnly === "boolean" ? v.wifiOnly : DEFAULT_SETTINGS.wifiOnly,
    companionMode: typeof v.companionMode === "boolean" ? v.companionMode : DEFAULT_SETTINGS.companionMode,
    companionTimer: typeof v.companionTimer === "boolean" ? v.companionTimer : DEFAULT_SETTINGS.companionTimer,
    defaultSoundscapeId:
      typeof soundscape === "string" && soundscape !== "" ? soundscape : DEFAULT_SETTINGS.defaultSoundscapeId,
  };
}

export function createSettingsStore(kv: Kv) {
  let state: Settings = parseSettings(kv.getItem(KEY));
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: (): Settings => state,
    /** Saves a change as it is made; there is no Save button (design/layouts/DECISION.md, Settings). */
    set(patch: Partial<Settings>): void {
      const next = { ...state, ...patch };
      if (
        next.wifiOnly === state.wifiOnly &&
        next.companionMode === state.companionMode &&
        next.companionTimer === state.companionTimer &&
        next.defaultSoundscapeId === state.defaultSoundscapeId
      ) {
        return;
      }
      state = next;
      kv.setItem(KEY, JSON.stringify(state));
      listeners.forEach((l) => l());
    },
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
