#!/usr/bin/env node
// `pnpm catalog:add`: the one way a piece enters Mood Read's music catalog (spec 05, 05.1, A1). Owner only.
//
//   node scripts/secrets.mjs run --only CLOUDFLARE_S3_ACCESS_KEY_ID,CLOUDFLARE_S3_SECRET_ACCESS_KEY,S3_API_ENDPOINT -- \
//     pnpm catalog:add <audio.m4a|audio.opus> --piece <piece.json> --verdict <verdict.json> [--bucket <name>] [--dry-run]
//
// A node script cannot call a sub-agent, so the rights-checker's verdict is an input: a JSON record (docs/catalog.md)
// written by whoever ran the `rights-checker` sub-agent on the recording. With no verdict, or any verdict but
// allowed (the checker's yes) with vocals none, nothing enters (agents.md rule 6: unclear counts as no). The entry is
// checked with the same validator the app reads with (src/lib/catalog.ts); then the audio goes to R2 under its
// content address (pieces/<sha256>.<ext>), the entry joins catalog.json, its version goes up by one, and catalog.json
// goes back up. `--dry-run` checks everything and writes nothing.
//
// Credentials only from the environment; never printed. R2 is reached through an injected S3-compatible client
// (scripts/catalog/s3.mjs), so tests run against an in-memory fake.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { AUDIO_FORMATS, CATALOG_FILE, checkCatalog, checkCatalogPiece, emptyCatalog, pieceKey } from '../src/lib/catalog.ts';
import { memorySource } from '../src/lib/meta/bytes.ts';
import { readAudioMeta } from '../src/lib/meta/read.ts';
import { createS3Client } from './catalog/s3.mjs';

export const DEFAULT_BUCKET = 'mood-read-catalog';
export const SECRETS = ['CLOUDFLARE_S3_ACCESS_KEY_ID', 'CLOUDFLARE_S3_SECRET_ACCESS_KEY', 'S3_API_ENDPOINT'];
/** A piece's file never changes under its key; the manifest is re-read within a minute. */
export const AUDIO_CACHE = 'public, max-age=31536000, immutable';
export const CATALOG_CACHE = 'public, max-age=60';
/** How far the stated duration may sit from the one the file's container states, in seconds. */
const DURATION_SLACK = 1;

const refuse = (...reasons) => ({ ok: false, reasons });

/** The file's format as the catalog knows it (aac or opus), from its bytes; or why it can't enter. */
export async function inspectAudio(bytes, name) {
  const meta = await readAudioMeta(memorySource(bytes), name);
  if (meta.drm) return { reason: 'the file is DRM-locked; Mood Read decrypts nothing (agents.md rule 6)' };
  let format = null;
  if (meta.format === 'mp4') format = 'aac';
  else if (meta.format === 'ogg' && new TextDecoder('latin1').decode(bytes.subarray(0, 128)).includes('OpusHead')) format = 'opus';
  if (!format) return { reason: `the file is ${meta.format === 'ogg' ? 'Ogg Vorbis' : meta.format}; convert it to AAC (.m4a) or Opus (.opus), loop-ready, first` };
  return { format, duration: typeof meta.duration === 'number' && meta.duration > 0 ? meta.duration : null };
}

/** The verdict record as the catalog stores it: the checker's `yes` is its `allowed`. */
function normalizeVerdict(v) {
  if (v && typeof v === 'object' && v.verdict === 'yes') return { ...v, verdict: 'allowed' };
  return v;
}

/**
 * Checks one piece and, unless `dryRun`, uploads it and the new catalog.json. Returns `{ ok: true, entry, catalog,
 * uploaded }` or `{ ok: false, reasons }`; throws only when R2 can't be reached.
 */
export async function addPiece({ audio, audioName, piece, verdict, s3, dryRun = false, now = () => new Date() }) {
  if (verdict === undefined || verdict === null) {
    return refuse('no rights-checker verdict: run the rights-checker sub-agent on the recording and pass its record with --verdict');
  }
  if (!piece || typeof piece !== 'object') return refuse('no piece metadata (--piece <piece.json>)');
  if (!(audio instanceof Uint8Array) || audio.length === 0) return refuse('no audio file');

  const seen = await inspectAudio(audio, audioName ?? '');
  if (seen.reason) return refuse(seen.reason);
  const stated = piece.duration;
  if (seen.duration !== null && typeof stated === 'number' && Math.abs(stated - seen.duration) > DURATION_SLACK) {
    return refuse(`the stated duration (${stated} s) differs from the file's (${seen.duration.toFixed(2)} s)`);
  }
  const duration = seen.duration ?? stated;
  const sha256 = createHash('sha256').update(audio).digest('hex');
  const addedAt = now().toISOString();

  const entry = {
    id: piece.id,
    title: piece.title,
    artist: piece.artist,
    kind: piece.kind,
    vocals: piece.vocals,
    moodTags: piece.moodTags,
    intensity: piece.intensity,
    source: piece.source,
    license: piece.license,
    credit: piece.credit ?? null,
    verdict: normalizeVerdict(verdict),
    duration,
    loop: piece.loop ?? (typeof duration === 'number' ? { start: 0, end: duration } : undefined),
    file: { key: pieceKey(sha256, seen.format), sha256, bytes: audio.length, format: seen.format, contentType: AUDIO_FORMATS[seen.format].contentType },
    addedAt,
  };
  const checked = checkCatalogPiece(entry);
  if (!checked.ok) return refuse(...checked.reasons);

  const raw = await s3.get(CATALOG_FILE);
  let current;
  if (raw === null) current = emptyCatalog(addedAt);
  else {
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return refuse('the catalog.json in the bucket is not JSON; fix it before adding');
    }
    const ok = checkCatalog(parsed);
    if (!ok.ok) return refuse('the catalog.json in the bucket fails its own check; fix it before adding', ...ok.reasons);
    current = ok.value;
  }
  const byId = current.pieces.find((p) => p.id === entry.id);
  if (byId) return refuse(`the id "${entry.id}" is already in the catalog`);
  const byHash = current.pieces.find((p) => p.file.sha256 === sha256);
  if (byHash) return refuse(`this file is already in the catalog as "${byHash.id}"`);

  const next = { schema: current.schema, version: current.version + 1, updatedAt: addedAt, pieces: [...current.pieces, entry] };
  const whole = checkCatalog(next);
  if (!whole.ok) return refuse(...whole.reasons);

  const uploaded = [];
  if (!dryRun) {
    if (!(await s3.head(entry.file.key))) {
      await s3.put(entry.file.key, audio, { contentType: entry.file.contentType, cacheControl: AUDIO_CACHE });
      uploaded.push(entry.file.key);
    }
    await s3.put(CATALOG_FILE, new TextEncoder().encode(`${JSON.stringify(next, null, 2)}\n`), { contentType: 'application/json', cacheControl: CATALOG_CACHE });
    uploaded.push(CATALOG_FILE);
  }
  return { ok: true, entry, catalog: next, uploaded, dryRun };
}

export function parseArgs(argv) {
  const out = { audio: null, piece: null, verdict: null, bucket: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--piece' || a === '--verdict' || a === '--bucket') out[a.slice(2)] = argv[++i] ?? null;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (!out.audio) out.audio = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return out;
}

/** An in-memory stand-in for a dry run with no credentials: an empty bucket that refuses writes. */
const emptyBucket = {
  get: async () => null,
  head: async () => false,
  put: async () => {
    throw new Error('a dry run writes nothing');
  },
};

const USAGE = 'usage: pnpm catalog:add <audio.m4a|audio.opus> --piece <piece.json> --verdict <verdict.json> [--bucket <name>] [--dry-run]\n(docs/catalog.md has both JSON shapes)';

/** Every vault value replaced, so no message can carry one. */
function mask(text, env) {
  let out = String(text);
  for (const name of SECRETS) if (env[name] && env[name].length >= 4) out = out.split(env[name]).join(`[secret ${name}]`);
  return out;
}

export async function main(argv = process.argv.slice(2), { env = process.env, log = console.log, err = console.error, makeClient = createS3Client, fetchImpl } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    err(`${e.message}\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    log(USAGE);
    return 0;
  }
  if (!args.audio || !args.piece) {
    err(USAGE);
    return 2;
  }
  let audio, piece, verdict;
  try {
    audio = new Uint8Array(readFileSync(args.audio));
    piece = JSON.parse(readFileSync(args.piece, 'utf8'));
    verdict = args.verdict ? JSON.parse(readFileSync(args.verdict, 'utf8')) : null;
  } catch (e) {
    err(`catalog:add: could not read an input: ${e.message}`);
    return 2;
  }
  const bucket = args.bucket ?? env.CATALOG_BUCKET ?? DEFAULT_BUCKET;
  const haveCreds = SECRETS.every((n) => env[n]);
  let s3;
  if (haveCreds) {
    s3 = makeClient({
      endpoint: env.S3_API_ENDPOINT,
      bucket,
      accessKeyId: env.CLOUDFLARE_S3_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDFLARE_S3_SECRET_ACCESS_KEY,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  } else if (args.dryRun) {
    log('catalog:add: no R2 credentials in the environment; the dry run checks against an empty catalog');
    s3 = emptyBucket;
  } else {
    err(`catalog:add: R2 credentials are missing. Run it through the vault:\n  node scripts/secrets.mjs run --only ${SECRETS.join(',')} -- pnpm catalog:add ...`);
    return 2;
  }

  let res;
  try {
    res = await addPiece({ audio, audioName: path.basename(args.audio), piece, verdict, s3, dryRun: args.dryRun });
  } catch (e) {
    err(`catalog:add: ${mask(e.message, env)}`);
    return 2;
  }
  if (!res.ok) {
    err(`catalog:add: refused "${piece.id ?? args.audio}":\n${res.reasons.map((r) => `  - ${r}`).join('\n')}`);
    return 1;
  }
  const what = `"${res.entry.id}" (${res.entry.file.key}, ${res.entry.file.bytes} bytes) as catalog version ${res.catalog.version}, bucket ${bucket}`;
  log(res.dryRun ? `catalog:add: dry run, nothing written; would add ${what}` : `catalog:add: added ${what}; uploaded ${res.uploaded.join(', ')}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}
