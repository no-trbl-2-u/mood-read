// The bed's bundled loops (01.7): the catalog in src/lib/soundscapes.ts (ids, names, lengths, licenses) bound to its
// files in assets/soundscapes/, synthesized by scripts/make-soundscapes.mjs, our own work (assets/soundscapes/README.md).
import { SOUNDSCAPE_INFO } from "@/lib/soundscapes";
import type { Soundscape } from "@/lib/types";

/** Each loop's file; a bundler needs every require spelled out. */
const LOOPS: Record<string, number> = {
  rain: require("../../assets/soundscapes/rain.wav"),
  "hearth-fire": require("../../assets/soundscapes/hearth-fire.wav"),
  "night-wind": require("../../assets/soundscapes/night-wind.wav"),
  tide: require("../../assets/soundscapes/tide.wav"),
  "static-hush": require("../../assets/soundscapes/static-hush.wav"),
  "low-cafe": require("../../assets/soundscapes/low-cafe.wav"),
};

export const SOUNDSCAPES: readonly Soundscape[] = SOUNDSCAPE_INFO.map((s) => ({ ...s, loop: LOOPS[s.id] }));

export { SOUNDSCAPE_IDS } from "@/lib/soundscapes";

export function soundscape(id: string | null): Soundscape | undefined {
  return id ? SOUNDSCAPES.find((s) => s.id === id) : undefined;
}
