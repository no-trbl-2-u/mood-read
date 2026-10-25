#!/usr/bin/env node
// `pnpm prescore`: the owner scores the most-downloaded LibriVox books ahead of time into the scoring proxy's shared
// cache, so Browse shows their overall moods (spec 05, 05.10, A11). Owner only.
//
//   node scripts/secrets.mjs run --only PRESCORE_TOKEN -- pnpm prescore [--limit 20] [--dry-run]
//     [--per-day 80] [--spacing-ms 30000] [--proxy <url>] [--from [dev-audiobooks.json]]
//
// It walks archive.org's LibriVox collection by downloads, most first (src/lib/librivox-api.ts popular), reads each
// book exactly as the app does when it downloads one (title, author, chapter titles, its LibriVox number, and its
// text's Project Gutenberg number from LibriVox's catalog), and sends that, and nothing more, to the proxy's owner-only
// POST /v1/prescore with the token. One book at a time: it waits for each run to finish before the next, so the proxy
// never reads more than one Gutenberg text at once.
//
// Throttled, because Project Gutenberg's terms flag more than about 100 downloads a day (seen in 05.9): at most
// --per-day books a day (80 by default, counted in .nexus/prescore-ledger.json across runs), at most --limit per run
// (20), and --spacing-ms between books (30 s, which also keeps LibriVox's catalog calls several seconds apart, as its
// API asks). It stops as soon as the proxy says pre-scoring's half of the monthly cap is spent (429, or a run that
// waits as capped). --dry-run lists what it would send and calls neither LibriVox's catalog nor the proxy.
//
// The owner's own books (05.22, A24): `--from [file]` (dev-audiobooks.json by default, gitignored; the shape is in
// dev-audiobooks.example.json) scores a list instead of the LibriVox walk: a JSON array of what the app would send
// for each book (src/lib/scoring-api.ts scoringRequest, as Settings' "Copy books for pre-scoring" copies it). Every
// entry is checked with the proxy's own parseBookRequest first; if any would be refused, each one is named and
// nothing is sent. A book with no LibriVox number is scored into the shared cache but not into Browse's index.
// The ledger's `done` list keys a book by its LibriVox number, else by its title and author, so a rerun skips it
// (and the proxy's cache answers an already-scored book with no new run anyway).
//
// The token comes only from the environment and is never printed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LIMITS, parseBookRequest } from '../proxy/src/validate.ts';
import { chapterFiles, chapterTitle, getItem, gutenbergIdFor, popular } from '../src/lib/librivox-api.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_FILE = path.join(ROOT, '.nexus', 'prescore-ledger.json');
export const DEFAULTS = { limit: 20, perDay: 80, spacingMs: 30_000, pollMs: 15_000, runTimeoutMs: 30 * 60_000, pageSize: 50 };
/** Never more than this many books a day, whatever --per-day says: Gutenberg's ~100 a day, with room for listeners. */
export const DAILY_CEILING = 80;
/** The proxy's own limit on chapters (proxy/src/validate.ts). */
const MAX_CHAPTERS = LIMITS.chapters;
/** The owner's list of their own books (05.22): gitignored, since the repo is public and the list names them. */
export const DEFAULT_LIST = 'dev-audiobooks.json';

export function parseArgs(argv) {
  const out = { ...DEFAULTS, dryRun: false, proxy: null, from: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const num = (name) => {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 0) throw new Error(`${name} needs a whole number`);
      return v;
    };
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--limit') out.limit = num('--limit');
    else if (a === '--per-day') out.perDay = num('--per-day');
    else if (a === '--spacing-ms') out.spacingMs = num('--spacing-ms');
    else if (a === '--proxy') out.proxy = argv[++i] ?? null;
    else if (a === '--from') out.from = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : DEFAULT_LIST;
    else throw new Error(`unknown option ${a}`);
  }
  out.perDay = Math.min(out.perDay, DAILY_CEILING);
  return out;
}

/** The proxy's base URL: --proxy, else app.json's `expo.extra.scoringProxyUrl` (the app's own). */
export function proxyUrl(args) {
  if (args.proxy) return args.proxy.replace(/\/+$/, '');
  const app = JSON.parse(readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  return String(app.expo?.extra?.scoringProxyUrl ?? '').replace(/\/+$/, '');
}

export function fileLedger(file = LEDGER_FILE) {
  return {
    read() {
      try {
        return JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        return null;
      }
    },
    write(v) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(v, null, 2) + '\n');
    },
  };
}

/** The ledger as of today: books sent today (the daily ceiling) and every book already scored (doneKey). */
function today(ledger, now) {
  const day = new Date(now()).toISOString().slice(0, 10);
  const v = ledger.read() ?? {};
  return { day, sent: v.day === day ? Number(v.sent) || 0 : 0, done: Array.isArray(v.done) ? v.done : [] };
}

const norm = (s) => String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * How the ledger's done list names a book: its LibriVox number, else its title and author. A bare number is what the
 * LibriVox walk has always written, so an older ledger keeps working.
 */
export function doneKey(book) {
  return book.librivoxId ? String(book.librivoxId) : `title:${norm(book.title)}|author:${norm(book.author)}`;
}

/**
 * The owner's list (05.22): a JSON array of scoring requests, each checked exactly as the proxy will check it
 * (proxy/src/validate.ts parseBookRequest, and its body size). Returns the books as the proxy would read them, or
 * throws naming every entry it would refuse, so nothing is sent from a list with a bad entry.
 */
export function parseBookList(text, name = DEFAULT_LIST) {
  let list;
  try {
    list = JSON.parse(text);
  } catch (e) {
    throw new Error(`${name} is not JSON: ${e.message}`);
  }
  if (!Array.isArray(list)) throw new Error(`${name} must be a JSON array of books (see dev-audiobooks.example.json)`);
  const books = [];
  const bad = [];
  list.forEach((entry, i) => {
    const label = `entry ${i + 1}${entry && typeof entry.title === 'string' ? ` (${entry.title})` : ''}`;
    if (new TextEncoder().encode(JSON.stringify(entry ?? null)).length > LIMITS.bodyBytes) return bad.push(`${label}: larger than the proxy accepts`);
    const parsed = parseBookRequest(entry);
    if (!parsed.ok) return bad.push(`${label}: ${parsed.error}`);
    books.push(parsed.book);
  });
  if (bad.length) throw new Error(`${name}: the proxy would refuse ${bad.length} of ${list.length} entries, so nothing was sent:\n  ${bad.join('\n  ')}`);
  return books;
}

/** Reads and checks the owner's list from disk (a relative path from the current directory). */
export function readBookList(file) {
  let text;
  try {
    text = readFileSync(path.resolve(file), 'utf8');
  } catch {
    throw new Error(`cannot read ${file}: paste Settings' "Copy books for pre-scoring" into it (shape: dev-audiobooks.example.json)`);
  }
  return parseBookList(text, file);
}

/** What the app would send for this LibriVox item (src/lib/librivox-download.ts pendingBookFrom, scoring-api.ts). */
export function bookFor(item, gutenbergId) {
  const book = {
    title: item.title,
    author: item.creator || 'Unknown author',
    chapters: chapterFiles(item.files).map((f, i) => chapterTitle(f.title, i)),
    librivoxId: item.catalogId,
  };
  if (gutenbergId) book.gutenbergId = gutenbergId;
  return book;
}

/**
 * Runs one pre-scoring session. Everything outside is injected (fetch, the token, the ledger, sleep, the clock, the
 * log), so tests run it against fakes. Returns { sent, skipped, stopped } where `stopped` says why it ended.
 */
/**
 * Runs one pre-scoring session. Everything outside is injected (fetch, the token, the ledger, sleep, the clock, the
 * log), so tests run it against fakes. With `books` (the owner's checked list, 05.22) it sends those; without, it walks
 * LibriVox's most downloaded. Returns { sent, skipped, planned, stopped } where `stopped` says why it ended.
 */
export async function runPrescore({ fetch: fetchImpl, token, base, args, ledger, sleep, now = Date.now, log = () => {}, books = null }) {
  const state = today(ledger, now);
  const done = new Set(state.done.map(String));
  const room = Math.max(0, Math.min(args.limit, args.perDay - state.sent));
  const summary = { sent: 0, skipped: 0, planned: [], stopped: 'limit' };
  if (room === 0) {
    summary.stopped = state.sent >= args.perDay ? 'daily ceiling' : 'limit';
    log(`Nothing to do: ${state.sent} sent today (ceiling ${args.perDay}), limit ${args.limit}.`);
    return summary;
  }
  if (!args.dryRun && !token) throw new Error('PRESCORE_TOKEN is not set: run through node scripts/secrets.mjs run --only PRESCORE_TOKEN -- pnpm prescore');
  if (!args.dryRun && (!base || /\.invalid$/.test(new URL(base).hostname))) throw new Error(`no proxy to send to (${base || 'none'}): set app.json's scoringProxyUrl or pass --proxy`);

  const save = () => !args.dryRun && ledger.write({ day: state.day, sent: state.sent, done: [...done] });
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const full = () => summary.sent + summary.planned.length >= room;
  const name = (book) => (book.librivoxId ? `#${book.librivoxId} ${book.title}` : `${book.title} (no LibriVox number: cached, not in Browse)`);
  const spent = "Pre-scoring's half of this month's cap is spent";

  /** Sends one book and waits for its run to end; returns why to stop, or null to go on. */
  async function send(book) {
    const res = await fetchImpl(`${base}/v1/prescore`, { method: 'POST', headers: auth, body: JSON.stringify(book) });
    if (res.status === 429) {
      log("The proxy says pre-scoring's half of this month's cap is spent. Stopping.");
      save();
      return 'half spent';
    }
    if (res.status === 401) throw new Error('the proxy refused the token (401): check PRESCORE_TOKEN in the vault and on the Worker');
    if (!res.ok) throw new Error(`the proxy answered ${res.status}`);
    let view = await res.json();
    state.sent++;
    summary.sent++;
    save();
    log(`sent ${name(book)}${book.gutenbergId ? ` (Gutenberg #${book.gutenbergId})` : ''}: ${view.state}`);
    // One run at a time: wait for this one before the next book.
    const started = now();
    while (view.state === 'running') {
      if (now() - started > args.runTimeoutMs) {
        log(`${name(book)} is still running after ${Math.round(args.runTimeoutMs / 60_000)} min; stopping so runs never pile up.`);
        return 'run timeout';
      }
      await sleep(args.pollMs);
      const poll = await fetchImpl(`${base}/v1/jobs/${view.jobId}`);
      if (!poll.ok) throw new Error(`the proxy answered ${poll.status} for job ${view.jobId}`);
      view = { ...view, ...(await poll.json()) };
    }
    if (view.state === 'done') {
      done.add(doneKey(book));
      save();
    } else if (view.state === 'capped') {
      log(`${spent}; the run waits. Stopping.`);
      return 'half spent';
    } else {
      log(`${name(book)} ended ${view.state}; moving on.`);
    }
    if (view.budget && view.budget.open === false) {
      log(`${spent}. Stopping.`);
      return 'half spent';
    }
    return null;
  }

  let first = true;
  if (books) {
    // The owner's list (05.22), already checked by parseBookList: each book goes exactly as the proxy will read it.
    for (const book of books) {
      if (full()) return summary;
      if (done.has(doneKey(book))) {
        summary.skipped++;
        continue;
      }
      if (args.dryRun) {
        summary.planned.push({ librivoxId: book.librivoxId ?? null, title: book.title, chapters: book.chapters.length });
        log(`would send ${name(book)} (${book.chapters.length} chapters)`);
        continue;
      }
      if (!first) await sleep(args.spacingMs);
      first = false;
      const stop = await send(book);
      if (stop) {
        summary.stopped = stop;
        return summary;
      }
    }
    summary.stopped = 'end of list';
    return summary;
  }

  for (let page = 1; page <= 20; page++) {
    const list = await popular(fetchImpl, args.pageSize, page);
    if (!list.length) {
      summary.stopped = 'end of list';
      return summary;
    }
    for (const hit of list) {
      if (full()) return summary;
      if (hit.catalogId && done.has(hit.catalogId)) {
        summary.skipped++;
        continue;
      }
      if (!first) await sleep(args.spacingMs);
      first = false;
      const item = await getItem(fetchImpl, hit.identifier);
      const chapters = chapterFiles(item.files);
      if (!item.catalogId || chapters.length === 0 || chapters.length > MAX_CHAPTERS) {
        summary.skipped++;
        log(`skip ${hit.identifier}: ${!item.catalogId ? 'no LibriVox number' : 'no usable chapters'}`);
        continue;
      }
      if (args.dryRun) {
        summary.planned.push({ librivoxId: item.catalogId, title: item.title, chapters: chapters.length });
        log(`would send #${item.catalogId} ${item.title} (${chapters.length} chapters)`);
        continue;
      }
      const stop = await send(bookFor(item, await gutenbergIdFor(fetchImpl, item.catalogId)));
      if (stop) {
        summary.stopped = stop;
        return summary;
      }
    }
  }
  return summary;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`prescore: ${e.message}`);
    return 2;
  }
  try {
    const books = args.from ? readBookList(args.from) : null;
    const out = await runPrescore({
      fetch: (url, init) => fetch(url, init),
      token: env.PRESCORE_TOKEN,
      base: proxyUrl(args),
      args,
      ledger: fileLedger(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      log: (line) => console.log(line),
      books,
    });
    console.log(args.dryRun ? `Dry run: ${out.planned.length} would be sent, ${out.skipped} skipped.` : `Sent ${out.sent}, skipped ${out.skipped}; stopped: ${out.stopped}.`);
    return 0;
  } catch (e) {
    console.error(`prescore: ${e.message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main();
