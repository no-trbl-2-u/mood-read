// `pnpm catalog:add` (05.1, A1) against an in-memory S3: the happy path, every refusal, the version bump, the dry
// run and the content-addressed key; and the SigV4 signer against AWS's own published example. No network.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { catalogOf, SOURCE, validPiece, validVerdict } from '../../src/lib/catalog-fixtures.ts';
import { readCatalog } from '../../src/lib/catalog.ts';
import { aaxFile, box, cat, ftyp, mp3Frames, mvhd, opusFile, vorbisFile } from '../../src/lib/meta/test-fixtures.ts';
import { addPiece, AUDIO_CACHE, inspectAudio, main, parseArgs } from '../catalog-add.mjs';
import { authorization, createS3Client, uriEncode } from '../catalog/s3.mjs';

/** A 120 s AAC file in an MP4 container (only the boxes the reader needs). */
const m4a = (seconds = 120, salt = 0) => cat(ftyp('M4A ', 'mp42'), box('moov', mvhd(1000, seconds * 1000)), box('mdat', new Uint8Array([salt, 1, 2, 3])));
const sha = (b) => createHash('sha256').update(b).digest('hex');

/** The metadata a person writes for a piece: everything but the verdict, the file record and addedAt. */
function pieceInput(over = {}) {
  const { verdict: _v, file: _f, addedAt: _a, ...rest } = validPiece();
  return { ...rest, ...over };
}

function memoryS3(initial = {}) {
  const objects = new Map(Object.entries(initial));
  const puts = [];
  return {
    objects,
    puts,
    get: async (key) => objects.get(key)?.body ?? null,
    head: async (key) => objects.has(key),
    put: async (key, body, opts) => {
      puts.push({ key, ...opts });
      objects.set(key, { body, ...opts });
    },
  };
}
const json = (o) => ({ body: new TextEncoder().encode(JSON.stringify(o)) });
const catalogIn = (s3) => JSON.parse(new TextDecoder().decode(s3.objects.get('catalog.json').body));
const NOW = () => new Date('2026-10-24T12:00:00.000Z');

test('happy path: audio up under its content address, the entry in catalog.json, version 1', async () => {
  const s3 = memoryS3();
  const audio = m4a();
  const res = await addPiece({ audio, audioName: 'night.m4a', piece: pieceInput(), verdict: validVerdict(), s3, now: NOW });
  assert.equal(res.ok, true, res.reasons?.join('; '));
  const key = `pieces/${sha(audio)}.m4a`;
  assert.deepEqual(res.uploaded, [key, 'catalog.json']);
  assert.equal(s3.objects.get(key).body, audio);
  assert.equal(s3.objects.get(key).contentType, 'audio/mp4');
  assert.equal(s3.objects.get(key).cacheControl, AUDIO_CACHE);
  assert.equal(s3.objects.get('catalog.json').contentType, 'application/json');
  const written = catalogIn(s3);
  assert.equal(written.version, 1);
  assert.equal(written.schema, 1);
  assert.equal(written.pieces.length, 1);
  const e = written.pieces[0];
  assert.deepEqual(e.file, { key, sha256: sha(audio), bytes: audio.length, format: 'aac', contentType: 'audio/mp4' });
  assert.equal(e.duration, 120);
  assert.deepEqual(e.loop, { start: 0, end: 120 });
  assert.equal(e.addedAt, '2026-10-24T12:00:00.000Z');
  // What it wrote is what the app reads, whole.
  assert.deepEqual(readCatalog(written).ignored, []);
});

test('an Opus file goes up as pieces/<sha256>.opus, audio/ogg, its duration from the last granule', async () => {
  const s3 = memoryS3();
  const audio = opusFile([], 30);
  const res = await addPiece({ audio, audioName: 'x.opus', piece: pieceInput({ duration: undefined, loop: { start: 1, end: 29 } }), verdict: validVerdict(), s3, now: NOW });
  assert.equal(res.ok, true, res.reasons?.join('; '));
  assert.equal(res.entry.file.key, `pieces/${sha(audio)}.opus`);
  assert.equal(res.entry.file.contentType, 'audio/ogg');
  assert.equal(res.entry.duration, 30);
  assert.deepEqual(res.entry.loop, { start: 1, end: 29 });
});

test('the version goes up by one on each add, and earlier pieces stay', async () => {
  const s3 = memoryS3();
  await addPiece({ audio: m4a(120, 1), piece: pieceInput(), verdict: validVerdict(), s3, now: NOW });
  const second = await addPiece({ audio: m4a(120, 2), piece: pieceInput({ id: 'dawn-chorus', title: 'Dawn Chorus' }), verdict: validVerdict(), s3, now: NOW });
  assert.equal(second.ok, true);
  const written = catalogIn(s3);
  assert.equal(written.version, 2);
  assert.deepEqual(written.pieces.map((p) => p.id), ['night-vigil', 'dawn-chorus']);
  const existing = memoryS3({ 'catalog.json': json(catalogOf([validPiece()], 41)) });
  await addPiece({ audio: m4a(), piece: pieceInput({ id: 'third' }), verdict: validVerdict(), s3: existing, now: NOW });
  assert.equal(catalogIn(existing).version, 42);
});

test('the checker\'s "yes" is stored as its "allowed"', async () => {
  const res = await addPiece({ audio: m4a(), piece: pieceInput(), verdict: validVerdict({ verdict: 'yes' }), s3: memoryS3(), now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.entry.verdict.verdict, 'allowed');
});

test('dry run: everything checked, nothing written', async () => {
  const s3 = memoryS3();
  const res = await addPiece({ audio: m4a(), piece: pieceInput(), verdict: validVerdict(), s3, dryRun: true, now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.catalog.version, 1);
  assert.deepEqual(res.uploaded, []);
  assert.deepEqual(s3.puts, []);
  const bad = await addPiece({ audio: m4a(), piece: pieceInput({ vocals: 'has-vocals' }), verdict: validVerdict(), s3, dryRun: true, now: NOW });
  assert.equal(bad.ok, false);
});

test('refused, nothing written: no verdict', async () => {
  for (const verdict of [undefined, null]) {
    const s3 = memoryS3();
    const res = await addPiece({ audio: m4a(), piece: pieceInput(), verdict, s3, now: NOW });
    assert.equal(res.ok, false);
    assert.match(res.reasons[0], /no rights-checker verdict/);
    assert.deepEqual(s3.puts, []);
  }
});

test('refused, nothing written: any verdict but allowed, or vocals the checker did not clear', async () => {
  const cases = [
    [validVerdict({ verdict: 'unclear' }), /unclear counts as no/],
    [validVerdict({ verdict: 'not-allowed' }), /not allowed/],
    [validVerdict({ vocals: 'unknown' }), /found vocals/],
    [validVerdict({ evidence: [] }), /no evidence/],
    [validVerdict({ source: 'https://music.example/tracks/other' }), /different recording/],
    [validVerdict({ license: { id: 'cc-by-sa', version: '4.0' } }), /different license/],
    ['allowed', /no rights-checker verdict/],
  ];
  for (const [verdict, why] of cases) {
    const s3 = memoryS3();
    const res = await addPiece({ audio: m4a(), piece: pieceInput(), verdict, s3, now: NOW });
    assert.equal(res.ok, false);
    assert.match(res.reasons.join(' | '), why);
    assert.deepEqual(s3.puts, []);
  }
});

test('refused, nothing written: the piece fails A1 (license, credit, vocals, mood tags)', async () => {
  const cases = [
    [{ license: { id: 'cc-by-nc', version: '4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' } }, /not one that allows playing/],
    [{ credit: null }, /asks for a credit line/],
    [{ vocals: undefined }, /not none/],
    [{ moodTags: [] }, /no mood tags/],
    [{ moodTags: ['eerie'] }, /fixed set/],
    [{ loop: { start: 0, end: 500 } }, /loop points/],
  ];
  for (const [over, why] of cases) {
    const s3 = memoryS3();
    const res = await addPiece({ audio: m4a(), piece: pieceInput(over), verdict: validVerdict(), s3, now: NOW });
    assert.equal(res.ok, false, JSON.stringify(over));
    assert.match(res.reasons.join(' | '), why);
    assert.deepEqual(s3.puts, []);
  }
});

test('refused: a file that is not AAC or Opus, or is DRM-locked, or a duration that disagrees with the file', async () => {
  const s3 = memoryS3();
  const cases = [
    [mp3Frames(40), 'a.mp3', /mp3; convert it/],
    [vorbisFile([], 10), 'a.ogg', /Ogg Vorbis; convert it/],
    [aaxFile(), 'a.aax', /DRM-locked/],
    [new Uint8Array(0), 'a.m4a', /no audio file/],
  ];
  for (const [audio, name, why] of cases) {
    const res = await addPiece({ audio, audioName: name, piece: pieceInput(), verdict: validVerdict(), s3, now: NOW });
    assert.equal(res.ok, false, name);
    assert.match(res.reasons[0], why);
  }
  const off = await addPiece({ audio: m4a(120), piece: pieceInput({ duration: 90 }), verdict: validVerdict(), s3, now: NOW });
  assert.match(off.reasons[0], /differs from the file's/);
  assert.deepEqual(s3.puts, []);
});

test('refused: an id already in the catalog, or the same file again (a piece is shared, never copied)', async () => {
  const s3 = memoryS3();
  const audio = m4a();
  await addPiece({ audio, piece: pieceInput(), verdict: validVerdict(), s3, now: NOW });
  const sameId = await addPiece({ audio: m4a(120, 9), piece: pieceInput(), verdict: validVerdict(), s3, now: NOW });
  assert.match(sameId.reasons[0], /already in the catalog/);
  const sameFile = await addPiece({ audio, piece: pieceInput({ id: 'other' }), verdict: validVerdict(), s3, now: NOW });
  assert.match(sameFile.reasons[0], /already in the catalog as "night-vigil"/);
  assert.equal(catalogIn(s3).version, 1);
});

test('refused: a catalog.json in the bucket that fails its own check is never written over', async () => {
  const broken = memoryS3({ 'catalog.json': json(catalogOf([validPiece({ vocals: 'has-vocals' })])) });
  const res = await addPiece({ audio: m4a(), piece: pieceInput({ id: 'new' }), verdict: validVerdict(), s3: broken, now: NOW });
  assert.match(res.reasons[0], /fails its own check/);
  assert.deepEqual(broken.puts, []);
  const garbage = memoryS3({ 'catalog.json': { body: new TextEncoder().encode('<html>') } });
  assert.match((await addPiece({ audio: m4a(), piece: pieceInput(), verdict: validVerdict(), s3: garbage, now: NOW })).reasons[0], /not JSON/);
});

test('audio already under its key is not uploaded again; the manifest still is', async () => {
  const audio = m4a();
  const s3 = memoryS3({ [`pieces/${sha(audio)}.m4a`]: { body: audio } });
  const res = await addPiece({ audio, piece: pieceInput(), verdict: validVerdict(), s3, now: NOW });
  assert.deepEqual(res.uploaded, ['catalog.json']);
});

test('inspectAudio names the format from the bytes, not the extension', async () => {
  assert.equal((await inspectAudio(m4a(), 'mislabelled.mp3')).format, 'aac');
  assert.equal((await inspectAudio(opusFile([], 5), 'x.ogg')).format, 'opus');
});

test('parseArgs reads the audio path, --piece, --verdict, --bucket and --dry-run', () => {
  assert.deepEqual(parseArgs(['a.m4a', '--piece', 'p.json', '--verdict', 'v.json', '--dry-run', '--bucket', 'b']), {
    audio: 'a.m4a', piece: 'p.json', verdict: 'v.json', bucket: 'b', dryRun: true, help: false,
  });
  assert.throws(() => parseArgs(['--force']), /unknown option/);
  assert.throws(() => parseArgs(['a', 'b']), /unexpected argument/);
});

function inputs() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'catalog-add-'));
  const audio = path.join(dir, 'night.m4a');
  writeFileSync(audio, m4a());
  writeFileSync(path.join(dir, 'piece.json'), JSON.stringify(pieceInput()));
  writeFileSync(path.join(dir, 'verdict.json'), JSON.stringify(validVerdict()));
  writeFileSync(path.join(dir, 'unclear.json'), JSON.stringify(validVerdict({ verdict: 'unclear' })));
  return { dir, audio, piece: path.join(dir, 'piece.json'), verdict: path.join(dir, 'verdict.json'), unclear: path.join(dir, 'unclear.json') };
}

const ENV = { CLOUDFLARE_S3_ACCESS_KEY_ID: 'test-access-key-id', CLOUDFLARE_S3_SECRET_ACCESS_KEY: 'test-secret-access-key-value', S3_API_ENDPOINT: 'https://acct-0123.r2.example' };

test('main: credentials from the environment, through the injected client; no secret is ever printed', async () => {
  const f = inputs();
  try {
    const s3 = memoryS3();
    let made = null;
    const lines = [];
    const code = await main([f.audio, '--piece', f.piece, '--verdict', f.verdict], {
      env: ENV,
      log: (l) => lines.push(l),
      err: (l) => lines.push(l),
      makeClient: (o) => { made = o; return s3; },
    });
    assert.equal(code, 0, lines.join('\n'));
    assert.equal(made.bucket, 'mood-read-catalog');
    assert.equal(made.accessKeyId, ENV.CLOUDFLARE_S3_ACCESS_KEY_ID);
    assert.equal(catalogIn(s3).version, 1);
    const out = lines.join('\n');
    for (const v of Object.values(ENV)) assert.ok(!out.includes(v), 'a secret was printed');
    // An R2 error that carries the endpoint comes out masked.
    const failing = { get: async () => { throw new Error(`fetch failed for ${ENV.S3_API_ENDPOINT}/x`); }, head: async () => false, put: async () => {} };
    const errs = [];
    assert.equal(await main([f.audio, '--piece', f.piece, '--verdict', f.verdict], { env: ENV, log: () => {}, err: (l) => errs.push(l), makeClient: () => failing }), 2);
    assert.ok(!errs.join('\n').includes(ENV.S3_API_ENDPOINT));
    assert.match(errs.join('\n'), /\[secret S3_API_ENDPOINT\]/);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('main: refuses with no verdict, an unclear verdict, or no credentials (outside a dry run)', async () => {
  const f = inputs();
  try {
    const s3 = memoryS3();
    const errs = [];
    const opts = { env: ENV, log: () => {}, err: (l) => errs.push(l), makeClient: () => s3 };
    assert.equal(await main([f.audio, '--piece', f.piece], opts), 1);
    assert.match(errs.pop(), /no rights-checker verdict/);
    assert.equal(await main([f.audio, '--piece', f.piece, '--verdict', f.unclear], opts), 1);
    assert.match(errs.pop(), /unclear counts as no/);
    assert.deepEqual(s3.puts, []);
    assert.equal(await main([f.audio, '--piece', f.piece, '--verdict', f.verdict], { ...opts, env: {} }), 2);
    assert.match(errs.pop(), /credentials are missing[\s\S]*secrets\.mjs run --only CLOUDFLARE_S3_ACCESS_KEY_ID/);
    assert.equal(await main([], opts), 2);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('main: a dry run with no credentials checks against an empty catalog and writes nothing', async () => {
  const f = inputs();
  try {
    const lines = [];
    let made = false;
    const code = await main([f.audio, '--piece', f.piece, '--verdict', f.verdict, '--dry-run'], { env: {}, log: (l) => lines.push(l), err: (l) => lines.push(l), makeClient: () => { made = true; } });
    assert.equal(code, 0, lines.join('\n'));
    assert.equal(made, false);
    assert.match(lines.join('\n'), /dry run, nothing written; would add "night-vigil" \(pieces\/[0-9a-f]{64}\.m4a/);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

// ---- the R2 client ----

test('SigV4 matches AWS\'s published example (GET Object, S3 docs, sig-v4-header-based-auth)', () => {
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const auth = authorization({
    method: 'GET',
    path: '/test.txt',
    headers: { host: 'examplebucket.s3.amazonaws.com', range: 'bytes=0-9', 'x-amz-content-sha256': payloadHash, 'x-amz-date': '20130524T000000Z' },
    payloadHash,
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    amzDate: '20130524T000000Z',
  });
  assert.equal(
    auth,
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
  );
});

test('uriEncode keeps unreserved characters (and / in paths) and escapes the rest', () => {
  assert.equal(uriEncode('pieces/a b+c~d.m4a', true), 'pieces/a%20b%2Bc~d.m4a');
  assert.equal(uriEncode('a/b'), 'a%2Fb');
});

test('the client signs path-style requests to <endpoint>/<bucket>/<key>; 404 is null; errors name no endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/missing.json')) return new Response('', { status: 404 });
    if (url.endsWith('/denied.json')) return new Response('', { status: 403 });
    return new Response(init.method === 'GET' ? '{"a":1}' : '', { status: 200 });
  };
  const s3 = createS3Client({ endpoint: ENV.S3_API_ENDPOINT, bucket: 'mood-read-catalog', accessKeyId: 'AK', secretAccessKey: 'SK', fetchImpl, now: NOW });
  assert.equal(new TextDecoder().decode(await s3.get('catalog.json')), '{"a":1}');
  assert.equal(await s3.get('missing.json'), null);
  assert.equal(await s3.head('catalog.json'), true);
  await s3.put('pieces/x.m4a', new Uint8Array([1, 2]), { contentType: 'audio/mp4', cacheControl: AUDIO_CACHE });
  assert.equal(calls[0].url, 'https://acct-0123.r2.example/mood-read-catalog/catalog.json');
  const put = calls[3];
  assert.equal(put.init.method, 'PUT');
  assert.equal(put.url, 'https://acct-0123.r2.example/mood-read-catalog/pieces/x.m4a');
  assert.equal(put.init.headers['content-type'], 'audio/mp4');
  assert.equal(put.init.headers['x-amz-date'], '20261024T120000Z');
  assert.equal(put.init.headers['x-amz-content-sha256'], sha(new Uint8Array([1, 2])));
  assert.match(put.init.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AK\/20261024\/auto\/s3\/aws4_request, SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  await assert.rejects(s3.get('denied.json'), (e) => /R2 answered 403 reading denied\.json/.test(e.message) && !e.message.includes('acct-0123'));
  // An endpoint that already names the bucket is not doubled.
  const s3b = createS3Client({ endpoint: `${ENV.S3_API_ENDPOINT}/mood-read-catalog`, bucket: 'mood-read-catalog', accessKeyId: 'AK', secretAccessKey: 'SK', fetchImpl, now: NOW });
  await s3b.get('catalog.json');
  assert.equal(calls.at(-1).url, 'https://acct-0123.r2.example/mood-read-catalog/catalog.json');
  assert.throws(() => createS3Client({ endpoint: '', bucket: 'b', accessKeyId: 'a', secretAccessKey: 's' }), /credentials are missing/);
});

test('the fixtures are made up: no real piece is named without its own rights check', () => {
  assert.match(SOURCE, /^https:\/\/music\.example\//);
});
