// The bundled soundscape catalog (01.7, spec 01 Contracts: Soundscape): each loop's id, name, length and license,
// pure so `node --test` reads it. The loop files themselves are bound in src/player/soundscapes.ts. Every loop is
// synthesized by scripts/make-soundscapes.mjs, this project's own work (assets/soundscapes/README.md), so each
// carries the project's own license (agents.md rule 6, A18).

/** The license every bundled loop carries: our own synthesis, no third-party material. */
export const OWNED_LICENSE = "Owned by the project: synthesized by scripts/make-soundscapes.mjs, no third-party material";

export type SoundscapeInfo = {
  id: string;
  name: string;
  /** The loop's length in seconds. */
  loopSeconds: number;
  /** What allows Mood Read to play it (A18). */
  license: string;
};

const LOOP_SECONDS = 24;

/** The six, in the mixer's chip order (design/layouts/DECISION.md, "Mixer (inline, in the expanded row)"). */
export const SOUNDSCAPE_INFO: readonly SoundscapeInfo[] = [
  { id: "rain", name: "Rain", loopSeconds: LOOP_SECONDS, license: OWNED_LICENSE },
  { id: "hearth-fire", name: "Hearth Fire", loopSeconds: LOOP_SECONDS, license: OWNED_LICENSE },
  { id: "night-wind", name: "Night Wind", loopSeconds: LOOP_SECONDS, license: OWNED_LICENSE },
  { id: "tide", name: "Tide", loopSeconds: LOOP_SECONDS, license: OWNED_LICENSE },
  { id: "static-hush", name: "Static Hush", loopSeconds: LOOP_SECONDS, license: OWNED_LICENSE },
  { id: "low-cafe", name: "Low Café", loopSeconds: LOOP_SECONDS, license: OWNED_LICENSE },
];

export const SOUNDSCAPE_IDS: readonly string[] = SOUNDSCAPE_INFO.map((s) => s.id);

/** A new book's soundscape: Night Wind, the one the design shows on the Layer line. */
export const DEFAULT_SOUNDSCAPE_ID = "night-wind";

export function soundscapeInfo(id: string | null): SoundscapeInfo | undefined {
  return id ? SOUNDSCAPE_INFO.find((s) => s.id === id) : undefined;
}
