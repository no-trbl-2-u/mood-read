// What the Credits screen thanks (spec 05, 05.5, A12): every catalog piece, every bundled soundscape and the readers
// of every LibriVox book on the device, each as its license asks. Pure, so `node --test` checks it; the screen
// (src/app/credits.tsx) hands it what this device knows and holds every word of copy around it.
//   - A catalog piece: title, artist, its license's name and version with the deed's link, its source page, and the
//     credit line. CC-BY and CC-BY-SA ask for one (catalog.ts CREDIT_REQUIRED); if a piece somehow lacks it, one is
//     written from the piece's own title, artist and license rather than shown without. CC0 and public domain ask
//     for none; a courtesy line the owner wrote is kept.
//   - A soundscape: synthesized for Mood Read, owned by the project (assets/soundscapes/README.md).
//   - A LibriVox book: public domain, so nothing is owed; its volunteer readers are thanked by name as a courtesy
//     when the book's "Read by ..." line named them (src/lib/librivox-api.ts readerNames), else as volunteers.
import { CREDIT_REQUIRED, type CatalogLicense, type CatalogPiece } from "./catalog.ts";
import { OWNED_LICENSE, type SoundscapeInfo } from "./soundscapes.ts";
import type { Book } from "./types.ts";

export type MusicCredit = {
  id: string;
  title: string;
  artist: string;
  /** "CC BY 4.0", "CC0 1.0", "Public domain". */
  license: string;
  /** The license deed (or public-domain mark); null when the catalog has none (public domain only). */
  licenseUrl: string | null;
  /** The recording's own page. */
  source: string;
  /** The credit line, word for word; always present where the license asks for one, else null or a courtesy. */
  credit: string | null;
  /** True when the license asks for the credit line (CC-BY, CC-BY-SA). */
  creditRequired: boolean;
};

export type SoundscapeCredit = {
  id: string;
  name: string;
  /** True for a loop the project made itself (every one today); false would mean a third-party license below. */
  owned: boolean;
  /** The license as recorded on the loop (soundscapes.ts). */
  license: string;
};

export type ReaderCredit = {
  bookId: string;
  title: string;
  author: string;
  /** The readers as LibriVox named them ("June Ashby and 6 other volunteers"), or null when it did not. */
  readers: string | null;
};

export type Credits = { music: MusicCredit[]; soundscapes: SoundscapeCredit[]; readers: ReaderCredit[] };

const LICENSE_NAMES: Record<CatalogLicense["id"], string> = {
  cc0: "CC0",
  "public-domain": "Public domain",
  "cc-by": "CC BY",
  "cc-by-sa": "CC BY-SA",
};

/** A license as people write it: "CC BY 4.0", "CC BY-SA 3.0", "CC0 1.0", "Public domain". */
export function licenseName(license: Pick<CatalogLicense, "id" | "version">): string {
  const name = LICENSE_NAMES[license.id];
  return license.version ? `${name} ${license.version}` : name;
}

/** The piece's credit line: its own, or, where the license asks for one and it has none, one written from it. */
export function creditLine(piece: Pick<CatalogPiece, "title" | "artist" | "license" | "credit">): string | null {
  const own = piece.credit?.trim();
  if (own) return own;
  return CREDIT_REQUIRED.includes(piece.license.id) ? `"${piece.title}" by ${piece.artist}, licensed under ${licenseName(piece.license)}` : null;
}

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);

export function buildCredits(input: {
  pieces: readonly CatalogPiece[];
  soundscapes: readonly SoundscapeInfo[];
  books: readonly Book[];
}): Credits {
  const music = input.pieces
    .map((p) => ({
      id: p.id,
      title: p.title,
      artist: p.artist,
      license: licenseName(p.license),
      licenseUrl: p.license.url,
      source: p.source,
      credit: creditLine(p),
      creditRequired: CREDIT_REQUIRED.includes(p.license.id),
    }))
    .sort(byTitle);
  const soundscapes = input.soundscapes.map((s) => ({ id: s.id, name: s.name, owned: s.license === OWNED_LICENSE, license: s.license }));
  const readers = input.books
    .filter((b) => b.source.kind === "librivox")
    .map((b) => ({ bookId: b.id, title: b.title, author: b.author, readers: b.narrator.trim() || null }))
    .sort(byTitle);
  return { music, soundscapes, readers };
}
