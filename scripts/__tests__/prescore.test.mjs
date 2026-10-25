// `pnpm prescore` (05.10, A11) against fakes: archive.org's popular list and metadata, LibriVox's catalog and the
// proxy are one injected fetch, the ledger is in memory and sleep only records. No network, no timers.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { DAILY_CEILING, DEFAULT_LIST, DEFAULTS, doneKey, main, parseArgs, parseBookList, runPrescore } from '../prescore.mjs';

const TOKEN = 'secret-token-value-that-must-never-print-0123456789';
const BASE = 'https://proxy.example';
const NOW = Date.UTC(2026, 9, 24, 9);

/** n popular LibriVox books, ids 101.., each with two chapters and a Gutenberg text. */
function world({ books = 30, answers = () => ({ status: 200, state: 'done' }), pollsUntilDone = 0 } = {}) {
  const calls = [];
  const posts = [];
  const polls = new Map();
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const u = new URL(url);
    if (u.hostname === 'archive.org' && u.pathname === '/advancedsearch.php') {
      const rows = Number(u.searchParams.get('rows'));
      const page = Number(u.searchParams.get('page'));
      assert.match(u.searchParams.get('q'), /collection:librivoxaudio/);
      assert.equal(u.searchParams.get('sort[]'), 'downloads desc');
      const docs = [];
      for (let i = (page - 1) * rows; i < Math.min(books, page * rows); i++) {
        docs.push({ identifier: `book_${101 + i}`, title: `Book ${101 + i}`, creator: 'An Author', call_number: String(101 + i) });
      }
      return Response.json({ response: { docs } });
    }
    if (u.hostname === 'archive.org' && u.pathname.startsWith('/metadata/')) {
      const n = u.pathname.split('_')[1];
      return Response.json({
        metadata: { identifier: `book_${n}`, title: `Book ${n}`, creator: 'An Author', call_number: n },
        files: [
          { name: 'a.mp3', title: '01 - Opening', track: '1', format: '64Kbps MP3' },
          { name: 'b.mp3', title: '02 - Closing', track: '2', format: '64Kbps MP3' },
        ],
      });
    }
    if (u.hostname === 'librivox.org') {
      const id = u.searchParams.get('id');
      return Response.json({ books: [{ id, url_text_source: `https://www.gutenberg.org/ebooks/${Number(id) + 1000}` }] });
    }
    if (url === `${BASE}/v1/prescore`) {
      const body = JSON.parse(init.body);
      posts.push({ body, headers: init.headers });
      const a = answers(posts.length, body);
      const jobId = 'f'.repeat(63) + (posts.length % 10);
      polls.set(jobId, 0);
      if (a.status !== 200) return Response.json({ error: 'x', budget: { open: false } }, { status: a.status });
      return Response.json({ jobId, state: pollsUntilDone ? 'running' : a.state, progress: {}, budget: { open: a.open ?? true } });
    }
    const m = /\/v1\/jobs\/(\w+)$/.exec(url);
    if (m && url.startsWith(BASE)) {
      const n = polls.get(m[1]) + 1;
      polls.set(m[1], n);
      return Response.json({ jobId: m[1], state: n >= pollsUntilDone ? 'done' : 'running', progress: {} });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return { fetch, calls, posts };
}

function memoryLedger(initial = null) {
  let v = initial;
  let writes = 0;
  return { read: () => v, write: (x) => ((v = structuredClone(x)), writes++), get value() { return v; }, get writes() { return writes; } };
}

function run(w, over = {}) {
  const sleeps = [];
  const lines = [];
  const ledger = over.ledger ?? memoryLedger();
  const args = { ...parseArgs([]), ...(over.args ?? {}) };
  const p = runPrescore({ fetch: w.fetch, token: 'token' in over ? over.token : TOKEN, base: over.base ?? BASE, args, ledger, sleep: async (ms) => sleeps.push(ms), now: () => NOW, log: (l) => lines.push(l), books: over.books });
  return p.then((out) => ({ out, sleeps, lines, ledger }));
}

test('defaults: 20 a run, a daily ceiling of 80 that no flag can raise, 30 s between books', () => {
  assert.equal(DEFAULTS.limit, 20);
  assert.equal(DAILY_CEILING, 80);
  assert.equal(parseArgs([]).perDay, 80);
  assert.equal(parseArgs(['--per-day', '500']).perDay, 80, 'clamped to the ceiling');
  assert.equal(parseArgs(['--per-day', '10']).perDay, 10);
  assert.equal(parseArgs([]).spacingMs, 30_000);
  assert.throws(() => parseArgs(['--limit', 'lots']));
  assert.throws(() => parseArgs(['--surprise']));
});

test('sends each book as the app would, and nothing more, with the token in its header only', async () => {
  const w = world({ books: 3 });
  const { out, lines } = await run(w);
  assert.equal(out.sent, 3);
  assert.equal(w.posts.length, 3);
  assert.deepEqual(w.posts[0].body, { title: 'Book 101', author: 'An Author', chapters: ['Opening', 'Closing'], librivoxId: '101', gutenbergId: '1101' });
  for (const p of w.posts) assert.equal(p.headers.authorization, `Bearer ${TOKEN}`);
  assert.ok(lines.every((l) => !l.includes(TOKEN)), 'the token is never printed');
});

test('throttle: the per-run limit, spacing between books, and one run at a time', async () => {
  const w = world({ books: 40, pollsUntilDone: 2 });
  const { out, sleeps } = await run(w);
  assert.equal(out.sent, 20, 'the default limit');
  assert.equal(out.stopped, 'limit');
  assert.equal(sleeps.filter((ms) => ms === DEFAULTS.spacingMs).length, 19, 'spaced between books');
  // Each book's job is polled to done before the next book is sent.
  const order = w.calls.filter((c) => c.url.startsWith(BASE)).map((c) => (c.url.endsWith('/v1/prescore') ? 'send' : 'poll'));
  assert.equal(order.slice(0, 4).join(','), 'send,poll,poll,send');
});

test('the daily ceiling holds across runs through the ledger', async () => {
  const ledger = memoryLedger({ day: '2026-10-24', sent: 78, done: [] });
  const w = world({ books: 40 });
  const { out } = await run(w, { ledger });
  assert.equal(out.sent, 2);
  assert.equal(ledger.value.sent, 80);
  const again = await run(world(), { ledger });
  assert.equal(again.out.sent, 0);
  assert.equal(again.out.stopped, 'daily ceiling');
  const tomorrow = memoryLedger({ day: '2026-10-23', sent: 80, done: [] });
  assert.equal((await run(world({ books: 2 }), { ledger: tomorrow })).out.sent, 2, 'a new day starts fresh');
});

test('books already scored are skipped', async () => {
  const ledger = memoryLedger({ day: '2026-10-24', sent: 0, done: ['101', '102'] });
  const w = world({ books: 4 });
  const { out } = await run(w, { ledger });
  assert.equal(out.skipped, 2);
  assert.deepEqual(w.posts.map((p) => p.body.librivoxId), ['103', '104']);
  assert.deepEqual(ledger.value.done.sort(), ['101', '102', '103', '104']);
});

test('stops when the proxy says the pre-score half is spent: a 429, a capped run, or a closed budget', async () => {
  const at429 = world({ answers: (n) => (n === 3 ? { status: 429 } : { status: 200, state: 'done' }) });
  const a = await run(at429);
  assert.equal(a.out.stopped, 'half spent');
  assert.equal(at429.posts.length, 3);
  assert.equal(a.out.sent, 2);

  const capped = world({ answers: (n) => ({ status: 200, state: n === 2 ? 'capped' : 'done' }) });
  const b = await run(capped);
  assert.equal(b.out.stopped, 'half spent');
  assert.equal(capped.posts.length, 2);

  const closing = world({ answers: () => ({ status: 200, state: 'done', open: false }) });
  const c = await run(closing);
  assert.equal(c.out.stopped, 'half spent');
  assert.equal(closing.posts.length, 1);
});

test('--dry-run lists what it would send and calls neither the proxy nor LibriVox, and writes nothing', async () => {
  const w = world({ books: 5 });
  const ledger = memoryLedger();
  const { out } = await run(w, { args: { dryRun: true }, token: undefined, base: 'https://mood-read-proxy.invalid', ledger });
  assert.equal(out.planned.length, 5);
  assert.equal(out.sent, 0);
  assert.ok(w.calls.every((c) => new URL(c.url).hostname === 'archive.org'));
  assert.equal(ledger.writes, 0);
});

test('refuses to run without the token, or with no real proxy', async () => {
  await assert.rejects(run(world(), { token: undefined }), /PRESCORE_TOKEN/);
  await assert.rejects(run(world(), { base: 'https://mood-read-proxy.invalid' }), /no proxy/);
  const refused = world({ answers: () => ({ status: 401 }) });
  await assert.rejects(run(refused), (e) => /refused the token/.test(e.message) && !e.message.includes(TOKEN));
});

// The owner's own books (05.22, A24): `--from <file>`.

const OWN = [
  { title: 'Dracula', author: 'Bram Stoker', chapters: ['Chapter 1', 'Chapter 2'], librivoxId: '101', gutenbergId: '345' },
  { title: 'My Own  Audiobook', author: 'Some Author', chapters: ['Part One', 'Part Two'] },
  { title: 'Another Of Mine', author: '', chapters: ['Side A'] },
];

test('--from takes a file, or dev-audiobooks.json when none is named; without it the LibriVox walk runs', () => {
  assert.equal(DEFAULT_LIST, 'dev-audiobooks.json');
  assert.equal(parseArgs([]).from, null);
  assert.equal(parseArgs(['--from']).from, 'dev-audiobooks.json');
  assert.equal(parseArgs(['--from', '--dry-run']).from, 'dev-audiobooks.json');
  assert.equal(parseArgs(['--from', '--dry-run']).dryRun, true);
  assert.equal(parseArgs(['--from', 'mine.json', '--limit', '3']).from, 'mine.json');
});

test("the list is checked with the proxy's own validation; any entry it would refuse is named and nothing is sent", async () => {
  assert.deepEqual(parseBookList(JSON.stringify(OWN)).map((b) => b.title), ['Dracula', 'My Own Audiobook', 'Another Of Mine']);
  const bad = [...OWN, { title: 'Leaky', author: 'X', chapters: ['A'], path: '/sdcard/Leaky.m4b' }, { title: '', author: 'Y', chapters: ['A'] }, { title: 'Z', author: 'Z', chapters: [], librivoxId: '0012' }];
  assert.throws(
    () => parseBookList(JSON.stringify(bad), 'dev-audiobooks.json'),
    (e) => /refuse 3 of 6/.test(e.message) && /entry 4 \(Leaky\).*refused: path/.test(e.message) && /entry 5/.test(e.message) && /entry 6 \(Z\)/.test(e.message) && /nothing was sent/.test(e.message),
  );
  assert.throws(() => parseBookList('{"title":"not a list"}'), /JSON array/);
  assert.throws(() => parseBookList('not json'), /not JSON/);
  const huge = [{ title: 'Big', author: 'B', chapters: Array.from({ length: 300 }, (_, i) => `${'x'.repeat(290)} ${i}`) }];
  assert.throws(() => parseBookList(JSON.stringify(huge)), /larger than the proxy accepts/);

  // main() refuses the file before any fetch: no token, no proxy, no network needed to fail.
  const dir = mkdtempSync(path.join(tmpdir(), 'prescore-'));
  const file = path.join(dir, 'dev-audiobooks.json');
  writeFileSync(file, JSON.stringify(bad));
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => {
    fetched++;
    throw new Error('no fetch');
  };
  const errors = [];
  const realError = console.error;
  console.error = (l) => errors.push(l);
  try {
    assert.equal(await main(['--from', file], { PRESCORE_TOKEN: TOKEN }), 1);
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(fetched, 0, 'nothing was sent');
  assert.match(errors.join('\n'), /entry 4 \(Leaky\)/);
});

test('the example file shows the shape, and every entry in it passes', () => {
  const example = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dev-audiobooks.example.json'), 'utf8');
  const books = parseBookList(example, 'dev-audiobooks.example.json');
  assert.ok(books.some((b) => b.librivoxId) && books.some((b) => !b.librivoxId), 'one with a LibriVox number, one without');
});

test('scores the list through the owner route, books with no LibriVox number included, under the same token and throttle', async () => {
  const w = world();
  const { out, sleeps, lines, ledger } = await run(w, { books: parseBookList(JSON.stringify(OWN)) });
  assert.equal(out.sent, 3);
  assert.equal(out.stopped, 'end of list');
  assert.deepEqual(w.posts.map((p) => p.body), [
    { title: 'Dracula', author: 'Bram Stoker', chapters: ['Chapter 1', 'Chapter 2'], librivoxId: '101', gutenbergId: '345' },
    { title: 'My Own Audiobook', author: 'Some Author', chapters: ['Part One', 'Part Two'] },
    { title: 'Another Of Mine', author: '', chapters: ['Side A'] },
  ]);
  for (const p of w.posts) assert.equal(p.headers.authorization, `Bearer ${TOKEN}`);
  assert.ok(w.calls.every((c) => c.url.startsWith(BASE)), 'no LibriVox or archive.org call for a list');
  assert.equal(sleeps.filter((ms) => ms === DEFAULTS.spacingMs).length, 2, 'spaced between books');
  assert.ok(lines.every((l) => !l.includes(TOKEN)));
  assert.deepEqual(ledger.value.done, ['101', doneKey(OWN[1]), doneKey(OWN[2])]);
  assert.equal(ledger.value.sent, 3, 'counted against the same daily ceiling');
});

test("a rerun skips what the ledger has done, by LibriVox number else title and author, and an older ledger's numbers still count", async () => {
  assert.equal(doneKey({ title: 'X', author: 'Y', librivoxId: '7' }), '7');
  assert.equal(doneKey({ title: '  My Own   AUDIOBOOK ', author: 'Some Author' }), doneKey({ title: 'my own audiobook', author: 'some author' }));
  assert.notEqual(doneKey({ title: 'Same', author: 'One' }), doneKey({ title: 'Same', author: 'Two' }));

  const ledger = memoryLedger({ day: '2026-10-23', sent: 5, done: ['101', 'title:my own audiobook|author:some author'] });
  const w = world();
  const { out } = await run(w, { ledger, books: parseBookList(JSON.stringify(OWN)) });
  assert.equal(out.skipped, 2);
  assert.deepEqual(w.posts.map((p) => p.body.title), ['Another Of Mine']);
  const again = world();
  const second = await run(again, { ledger, books: parseBookList(JSON.stringify(OWN)) });
  assert.equal(second.out.skipped, 3);
  assert.equal(again.posts.length, 0, 'nothing left to send');
});

test('the list stops like the walk: per-run limit, daily ceiling, and a spent half', async () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ title: `Mine ${i}`, author: 'Me', chapters: ['One'] }));
  const limited = world();
  assert.equal((await run(limited, { books: many, args: { limit: 2 } })).out.sent, 2);
  const ceiling = world();
  const near = memoryLedger({ day: '2026-10-24', sent: 79, done: [] });
  assert.equal((await run(ceiling, { books: many, ledger: near })).out.sent, 1);
  const spentHalf = world({ answers: (n) => (n === 2 ? { status: 429 } : { status: 200, state: 'done' }) });
  const s = await run(spentHalf, { books: many });
  assert.equal(s.out.stopped, 'half spent');
  assert.equal(spentHalf.posts.length, 2);
  await assert.rejects(run(world(), { books: many, token: undefined }), /PRESCORE_TOKEN/);
});

test('--from with --dry-run lists the books and calls nothing, before the proxy is live', async () => {
  const w = world();
  const ledger = memoryLedger();
  const { out, lines } = await run(w, { books: parseBookList(JSON.stringify(OWN)), args: { dryRun: true }, token: undefined, base: 'https://mood-read-proxy.invalid', ledger });
  assert.equal(out.planned.length, 3);
  assert.deepEqual(out.planned[1], { librivoxId: null, title: 'My Own Audiobook', chapters: 2 });
  assert.match(lines[1], /no LibriVox number: cached, not in Browse/);
  assert.equal(w.calls.length, 0);
  assert.equal(ledger.writes, 0);
});
