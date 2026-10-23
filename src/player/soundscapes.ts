// The bed's bundled loops. Until 01.7 brings the licensed soundscapes, two placeholder test loops made by
// scripts/make-test-loops.mjs (our own synthetic tones, no third-party license; assets/soundscapes/README.md).
import type { Soundscape } from "@/lib/types";

export const SOUNDSCAPES: readonly Soundscape[] = [
  { id: "test-low-hum", name: "Low Hum (test loop)", loop: require("../../assets/soundscapes/test-low-hum.wav"), loopSeconds: 4 },
  { id: "test-drift", name: "Drift (test loop)", loop: require("../../assets/soundscapes/test-drift.wav"), loopSeconds: 4 },
];

export const SOUNDSCAPE_IDS: readonly string[] = SOUNDSCAPES.map((s) => s.id);

export function soundscape(id: string | null): Soundscape | undefined {
  return id ? SOUNDSCAPES.find((s) => s.id === id) : undefined;
}
