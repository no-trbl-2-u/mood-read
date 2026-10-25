// How well the music catalog covers the scorer's fixed emotions at each intensity (spec 05, 05.2, A2): every emotion
// at low and at high intensity, with at least three pieces each. A piece counts toward every emotion it is tagged
// with, at its one intensity. Pure and type-strippable (node --test and node scripts load it as is).
import { INTENSITIES, type Catalog, type Intensity } from "./catalog.ts";
import { EMOTIONS, type Emotion } from "./types.ts";

/** A2's floor: the fewest pieces any (emotion, intensity) cell may hold. */
export const MIN_PIECES_PER_CELL = 3;

export type CoverageCell = { emotion: Emotion; intensity: Intensity; ids: string[] };

/** Every (emotion, intensity) cell in the scorer's order, low before high, with the ids that fill it. */
export type Coverage = { cells: CoverageCell[]; short: CoverageCell[] };

/** The coverage of these pieces: each cell's piece ids (catalog order), and the cells under `min`. */
export function catalogCoverage(catalog: Pick<Catalog, "pieces">, min = MIN_PIECES_PER_CELL): Coverage {
  const cells: CoverageCell[] = [];
  for (const emotion of EMOTIONS) {
    for (const intensity of INTENSITIES) {
      const ids = catalog.pieces.filter((p) => p.intensity === intensity && p.moodTags.includes(emotion)).map((p) => p.id);
      cells.push({ emotion, intensity, ids });
    }
  }
  return { cells, short: cells.filter((c) => c.ids.length < min) };
}

/** The coverage as a plain-text table, one line per cell: "tension  low   5  a, b, c". */
export function formatCoverage(coverage: Coverage): string {
  return coverage.cells
    .map((c) => `${c.emotion.padEnd(8)} ${c.intensity.padEnd(5)} ${String(c.ids.length).padStart(2)}  ${c.ids.join(", ")}`)
    .join("\n");
}
