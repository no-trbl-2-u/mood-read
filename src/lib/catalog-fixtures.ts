// A catalog entry that passes A1, and the rights-checker verdict behind it, for the catalog tests (the app's and
// scripts/__tests__/catalog-add.test.mjs). Each test breaks one field to walk one refusal. The piece is made up
// (example.com-style hosts): no real piece is named without its own rights check (agents.md rule 6).
import { CATALOG_SCHEMA, pieceKey, type Catalog, type CatalogPiece, type RightsVerdict } from "./catalog.ts";

export const SOURCE = "https://music.example/tracks/night-vigil";

export function validVerdict(over: Partial<RightsVerdict> = {}): RightsVerdict {
  return {
    by: "rights-checker",
    verdict: "allowed",
    vocals: "none",
    useChecked: "stream and loop under narration in a free app, credited on a Credits screen",
    source: SOURCE,
    license: { id: "cc-by", version: "4.0" },
    evidence: [
      {
        quote: "You are free to: Share - copy and redistribute the material in any medium or format for any purpose",
        url: "https://creativecommons.org/licenses/by/4.0/",
        readOn: "2026-10-24",
      },
    ],
    conditions: "attribution",
    checkedOn: "2026-10-24",
    ...over,
  };
}

export function validPiece(over: Partial<CatalogPiece> = {}): CatalogPiece {
  const sha256 = "ab".repeat(32);
  return {
    id: "night-vigil",
    title: "Night Vigil",
    artist: "A. Composer",
    kind: "instrumental",
    vocals: "none",
    moodTags: ["dread", "tension"],
    intensity: "low",
    source: SOURCE,
    license: { id: "cc-by", version: "4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
    credit: '"Night Vigil" by A. Composer (music.example), licensed under CC BY 4.0',
    verdict: validVerdict(),
    duration: 120,
    loop: { start: 0, end: 120 },
    file: { key: pieceKey(sha256, "aac"), sha256, bytes: 1_920_000, format: "aac", contentType: "audio/mp4" },
    addedAt: "2026-10-24T12:00:00.000Z",
    ...over,
  };
}

export function catalogOf(pieces: unknown[], version = pieces.length): Catalog {
  return { schema: CATALOG_SCHEMA, version, updatedAt: "2026-10-24T12:00:00.000Z", pieces: pieces as CatalogPiece[] };
}
