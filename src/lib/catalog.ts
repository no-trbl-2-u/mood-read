// The music catalog's contract (spec 05, Contracts; 05.1): `CatalogPiece` and the versioned `catalog.json`, and the
// one validator both sides use. The app reads it (src/lib/catalog-api.ts) and ignores any entry that fails; the
// owner's `pnpm catalog:add` (scripts/catalog-add.mjs) imports this same file and refuses any piece that fails.
// A1: every piece carries a license that allows playing it in the app (CC0, public domain, CC-BY or CC-BY-SA), a
// rights-checker `yes` (its `allowed`) with the evidence it rests on, vocals `none` and mood tags; nothing else
// enters. The contract written out for people: docs/catalog.md.
// Pure and type-strippable (node --test and node scripts load it as is): no enums, no runtime imports beyond ./types.
import { EMOTIONS, type Piece } from "./types.ts";

/** The shape version of catalog.json. A file with another schema is refused whole; `version` is its revision. */
export const CATALOG_SCHEMA = 1;
/** The manifest's key in the bucket and its path under the public base URL. */
export const CATALOG_FILE = "catalog.json";

/** The licenses that allow playing a piece in the app (A1, A18). NC, ND and all-rights-reserved never enter (D7). */
export const LICENSE_IDS = ["cc0", "public-domain", "cc-by", "cc-by-sa"] as const;
export type LicenseId = (typeof LICENSE_IDS)[number];
/** The licenses whose terms ask for a credit line, shown on the Credits screen (05.5, A12). */
export const CREDIT_REQUIRED: readonly LicenseId[] = ["cc-by", "cc-by-sa"];
/** The versions each Creative Commons license exists in; a public-domain piece has no version. */
export const LICENSE_VERSIONS: Record<LicenseId, readonly string[]> = {
  cc0: ["1.0"],
  "public-domain": [],
  "cc-by": ["1.0", "2.0", "2.5", "3.0", "4.0"],
  "cc-by-sa": ["1.0", "2.0", "2.5", "3.0", "4.0"],
};

/** The audio a piece ships as (spec 05, Design: AAC or Opus, loop-ready), with its file extension and MIME type. */
export const AUDIO_FORMATS = {
  aac: { ext: "m4a", contentType: "audio/mp4" },
  opus: { ext: "opus", contentType: "audio/ogg" },
} as const;
export type AudioFormatId = keyof typeof AUDIO_FORMATS;

/** How strong the piece runs, so the seed set can cover every emotion at low and high intensity (A2, 05.2). */
export const INTENSITIES = ["low", "high"] as const;
export type Intensity = (typeof INTENSITIES)[number];

export const PIECE_KINDS: readonly Piece["kind"][] = ["score", "instrumental", "ambient"];

export type CatalogLicense = {
  id: LicenseId;
  /** "4.0" and the like; null for public domain. */
  version: string | null;
  /** The license deed (or the public-domain mark) a credit links to; null only for public domain. */
  url: string | null;
};

/** One line of evidence a verdict rests on: the clause quoted word for word, where it was read, and when. */
export type VerdictEvidence = { quote: string; url: string; readOn: string };

/**
 * The rights-checker's verdict on this recording (.claude/agents/rights-checker.md), as the person who ran it wrote it
 * down. Only `allowed` (the checker's yes) with vocals `none` enters; `unclear` counts as no (agents.md rule 6).
 */
export type RightsVerdict = {
  by: "rights-checker";
  verdict: "allowed";
  vocals: "none";
  /** The use the checker was asked about, e.g. "stream and loop under narration in a free app". */
  useChecked: string;
  /** The recording checked: the same URL as the piece's `source`. */
  source: string;
  /** The license the checker found; the piece's own license must match it. */
  license: { id: LicenseId; version: string | null };
  evidence: VerdictEvidence[];
  /** What the license asks (attribution and the like), or "none". */
  conditions: string;
  /** YYYY-MM-DD. */
  checkedOn: string;
};

/** The audio file in the bucket: content-addressed (`pieces/<sha256>.<ext>`), so a key never changes meaning. */
export type CatalogFile = {
  key: string;
  /** Lowercase hex SHA-256 of the file's bytes. */
  sha256: string;
  bytes: number;
  format: AudioFormatId;
  contentType: string;
};

/** Spec 01's Piece plus where it came from, what allows it, its verdict, and the file that plays. */
export type CatalogPiece = Piece & {
  intensity: Intensity;
  /** The recording's page (https), the URL the rights-checker checked. */
  source: string;
  license: CatalogLicense;
  /** The credit line the license asks for; required for CC-BY and CC-BY-SA, else null or a courtesy line. */
  credit: string | null;
  verdict: RightsVerdict;
  /** Seconds. */
  duration: number;
  /** Where the loop starts and ends, seconds into the file (0 <= start < end <= duration). */
  loop: { start: number; end: number };
  file: CatalogFile;
  /** ISO timestamp of the `catalog:add` that wrote it. */
  addedAt: string;
};

/** catalog.json. `version` goes up by one with every add; `updatedAt` is the add's ISO timestamp. */
export type Catalog = { schema: typeof CATALOG_SCHEMA; version: number; updatedAt: string; pieces: CatalogPiece[] };

export type Check<T> = { ok: true; value: T } | { ok: false; reasons: string[] };

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
function httpsUrl(x: unknown): x is string {
  if (typeof x !== "string") return false;
  try {
    return new URL(x).protocol === "https:";
  } catch {
    return false;
  }
}
function day(x: unknown): x is string {
  return typeof x === "string" && DAY.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`)) && new Date(`${x}T00:00:00Z`).toISOString().startsWith(x);
}
const isoTime = (x: unknown): x is string => typeof x === "string" && !Number.isNaN(Date.parse(x)) && /^\d{4}-\d{2}-\d{2}T/.test(x);
const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T => typeof x === "string" && (list as readonly string[]).includes(x);

/** The content-addressed key a file of these bytes and this format lives under. */
export function pieceKey(sha256: string, format: AudioFormatId): string {
  return `pieces/${sha256}.${AUDIO_FORMATS[format].ext}`;
}

/** The license's reasons to refuse, if any. */
function licenseReasons(x: unknown, where: string): string[] {
  if (!isObject(x)) return [`${where} is missing`];
  if (!oneOf(LICENSE_IDS, x.id)) return [`${where} "${String(x.id)}" is not one that allows playing in the app (cc0, public-domain, cc-by, cc-by-sa)`];
  const versions = LICENSE_VERSIONS[x.id];
  if (versions.length === 0 ? x.version !== null : !oneOf(versions, x.version)) {
    return [versions.length === 0 ? `${where}: public domain has no version (null)` : `${where} ${x.id} needs a version, one of ${versions.join(", ")}`];
  }
  return [];
}

/** Why a verdict record does not let a piece in; empty when it does. */
export function verdictReasons(x: unknown): string[] {
  if (!isObject(x)) return ["no rights-checker verdict"];
  const r: string[] = [];
  if (x.by !== "rights-checker") r.push("the verdict is not the rights-checker's");
  if (x.verdict !== "allowed") r.push(`the rights-checker's verdict is "${String(x.verdict)}", not allowed (unclear counts as no)`);
  if (x.vocals !== "none") r.push(`the rights-checker found vocals "${String(x.vocals)}", not none (A20)`);
  if (!text(x.useChecked)) r.push("the verdict does not say which use was checked");
  if (!httpsUrl(x.source)) r.push("the verdict does not name the recording it checked (an https source URL)");
  r.push(...licenseReasons(x.license, "the verdict's license"));
  if (!Array.isArray(x.evidence) || x.evidence.length === 0) r.push("the verdict records no evidence");
  else if (!x.evidence.every((e) => isObject(e) && text(e.quote) && httpsUrl(e.url) && day(e.readOn))) r.push("every piece of evidence needs a quote, an https URL and the day it was read");
  if (typeof x.conditions !== "string") r.push("the verdict does not record its conditions (\"none\" if there are none)");
  if (!day(x.checkedOn)) r.push("the verdict has no date (YYYY-MM-DD)");
  return r;
}

/** Checks one catalog entry against A1 and the contract; every reason it fails, or the piece. */
export function checkCatalogPiece(x: unknown): Check<CatalogPiece> {
  if (!isObject(x)) return { ok: false, reasons: ["not a catalog entry"] };
  const r: string[] = [];
  if (typeof x.id !== "string" || !ID.test(x.id) || x.id.length > 80) r.push("the id must be a lowercase slug (a-z, 0-9, dashes), 80 characters at most");
  if (!text(x.title)) r.push("no title");
  if (!text(x.artist)) r.push("no artist");
  if (!oneOf(PIECE_KINDS, x.kind)) r.push(`kind "${String(x.kind)}" is not one of ${PIECE_KINDS.join(", ")}`);
  if (x.vocals !== "none") r.push(`vocals "${String(x.vocals)}", not none (A20)`);
  if (!Array.isArray(x.moodTags) || x.moodTags.length === 0) r.push("no mood tags");
  else if (!x.moodTags.every((t) => oneOf(EMOTIONS, t))) r.push(`a mood tag outside the scorer's fixed set (${EMOTIONS.join(", ")})`);
  else if (new Set(x.moodTags).size !== x.moodTags.length) r.push("a mood tag is repeated");
  if (!oneOf(INTENSITIES, x.intensity)) r.push(`intensity "${String(x.intensity)}" is not low or high`);
  if (!httpsUrl(x.source)) r.push("no source URL (https)");

  const licenseBad = licenseReasons(x.license, "license");
  r.push(...licenseBad);
  const license = x.license as CatalogLicense;
  if (licenseBad.length === 0) {
    if (license.id === "public-domain" ? license.url !== null && !httpsUrl(license.url) : !httpsUrl(license.url)) r.push("the license needs its deed's https URL");
    if (CREDIT_REQUIRED.includes(license.id) && !text(x.credit)) r.push(`${license.id} asks for a credit line, and there is none`);
  }
  if (x.credit !== null && typeof x.credit !== "string") r.push("credit must be a line of text or null");

  const vr = verdictReasons(x.verdict);
  r.push(...vr);
  if (vr.length === 0 && licenseBad.length === 0) {
    const v = x.verdict as RightsVerdict;
    if (v.source !== x.source) r.push("the verdict is for a different recording than this piece's source");
    if (v.license.id !== license.id || v.license.version !== license.version) r.push("the verdict found a different license than the piece states");
  }

  if (!num(x.duration) || x.duration <= 0) r.push("no duration (seconds, above zero)");
  const loop = x.loop;
  if (!isObject(loop) || !num(loop.start) || !num(loop.end)) r.push("no loop points");
  else if (loop.start < 0 || loop.end <= loop.start || (num(x.duration) && loop.end > x.duration)) r.push("loop points must satisfy 0 <= start < end <= duration");

  const f = x.file;
  if (!isObject(f)) r.push("no file record");
  else {
    if (typeof f.sha256 !== "string" || !SHA256.test(f.sha256)) r.push("the file's hash is not a SHA-256 (64 lowercase hex)");
    if (!Number.isSafeInteger(f.bytes) || (f.bytes as number) <= 0) r.push("the file's size is not a positive whole number of bytes");
    if (!oneOf(Object.keys(AUDIO_FORMATS) as AudioFormatId[], f.format)) r.push(`the file's format "${String(f.format)}" is not aac or opus`);
    else {
      if (f.contentType !== AUDIO_FORMATS[f.format].contentType) r.push(`the file's content type must be ${AUDIO_FORMATS[f.format].contentType}`);
      if (typeof f.sha256 === "string" && SHA256.test(f.sha256) && f.key !== pieceKey(f.sha256, f.format)) r.push("the file's key is not its content address (pieces/<sha256>.<ext>)");
    }
  }
  if (!isoTime(x.addedAt)) r.push("no addedAt timestamp");

  return r.length ? { ok: false, reasons: r } : { ok: true, value: x as CatalogPiece };
}

export type Ignored = { id: string | null; reasons: string[] };

/** Why the file as a whole cannot be read (its envelope, not its entries); empty when it can. */
function envelopeReasons(x: unknown): string[] {
  if (!isObject(x)) return ["catalog.json is not an object"];
  const r: string[] = [];
  if (x.schema !== CATALOG_SCHEMA) r.push(`catalog.json is schema ${String(x.schema)}; this reads schema ${CATALOG_SCHEMA}`);
  if (!Number.isSafeInteger(x.version) || (x.version as number) < 0) r.push("catalog.json has no version");
  if (!isoTime(x.updatedAt)) r.push("catalog.json has no updatedAt");
  if (!Array.isArray(x.pieces)) r.push("catalog.json has no pieces list");
  return r;
}

/**
 * The app's read: the envelope must hold (else it throws), and every entry that fails A1 or the contract, or repeats
 * an id or a file already taken, is left out and listed in `ignored`, never played or named.
 */
export function readCatalog(x: unknown): { catalog: Catalog; ignored: Ignored[] } {
  const bad = envelopeReasons(x);
  if (bad.length) throw new Error(bad.join("; "));
  const c = x as Catalog;
  const pieces: CatalogPiece[] = [];
  const ignored: Ignored[] = [];
  const ids = new Set<string>();
  const hashes = new Set<string>();
  for (const entry of c.pieces as unknown[]) {
    const id = isObject(entry) && typeof entry.id === "string" ? entry.id : null;
    const res = checkCatalogPiece(entry);
    if (!res.ok) ignored.push({ id, reasons: res.reasons });
    else if (ids.has(res.value.id)) ignored.push({ id, reasons: ["the id is already taken by an earlier entry"] });
    else if (hashes.has(res.value.file.sha256)) ignored.push({ id, reasons: ["the same file is already an earlier entry"] });
    else {
      ids.add(res.value.id);
      hashes.add(res.value.file.sha256);
      pieces.push(res.value);
    }
  }
  return { catalog: { schema: CATALOG_SCHEMA, version: c.version, updatedAt: c.updatedAt, pieces }, ignored };
}

/** The writer's check: the whole file must hold, with no entry left out. */
export function checkCatalog(x: unknown): Check<Catalog> {
  let read: ReturnType<typeof readCatalog>;
  try {
    read = readCatalog(x);
  } catch (e) {
    return { ok: false, reasons: [(e as Error).message] };
  }
  if (read.ignored.length) return { ok: false, reasons: read.ignored.map((i) => `${i.id ?? "an entry"}: ${i.reasons.join("; ")}`) };
  return { ok: true, value: read.catalog };
}

/** An empty catalog, before the first add. */
export function emptyCatalog(now: string): Catalog {
  return { schema: CATALOG_SCHEMA, version: 0, updatedAt: now, pieces: [] };
}
