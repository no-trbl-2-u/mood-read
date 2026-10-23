// secrets-sync.mjs: `pnpm secrets:sync` pushes every name the manifest sends to `cloudflare` into mood-read-proxy,
// through the cloudflare sink, in manifest order, one line each and never a value (02.4, A5). node:test, no deps; a
// recording runner stands in for wrangler, and every value below is a fake.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AUDIT } from '../secrets-sinks.mjs';
import { WORKER, cloudflareNames, main, pinnedRunner } from '../secrets-sync.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAKES = { CF_B: 'fake-cf-b-0001', CF_A: 'fake "quoted" $(not run) 0002', GH_ONLY: 'fake-gh-0003', CF_C: 'fake-cf-c-0004' };

function recorder(reply = () => ({ status: 0 })) {
  const calls = [];
  return { calls, run: (cmd, args, opts = {}) => { calls.push({ cmd, args, ...opts }); return reply(cmd, args, opts); } };
}
const never = () => { throw new Error('a sink ran where none should'); };

const entry = (name, destinations) => ({ name, for: `${name} for a test.`, where: null, destinations, provider: 'owner', chunk: null });

function workspace({ set = Object.keys(FAKES) } = {}) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets sync '));
  const repo = path.join(ws, 'repo');
  fs.mkdirSync(repo);
  // Manifest order is CF_B, GH_ONLY, CF_A, CF_C: not alphabetical, so order is the manifest's.
  fs.writeFileSync(path.join(repo, 'nexus.secrets.json'), JSON.stringify({ version: 1, secrets: [
    entry('CF_B', ['local', 'github-actions', 'cloudflare']),
    entry('GH_ONLY', ['local', 'github-actions']),
    entry('CF_A', ['cloudflare']),
    entry('CF_C', ['local', 'cloudflare']),
  ] }));
  const quote = (v) => `"${v.replace(/"/g, '\\"')}"`;
  fs.writeFileSync(path.join(repo, '.env'), set.map((n) => `${n}=${quote(FAKES[n])}`).join('\n') + '\n');
  return { ws, repo, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

async function sync(t, argv = [], { owner = () => true, run = never } = {}) {
  const lines = [];
  const out = (s) => lines.push(s);
  const code = await main([...argv, '--root', t.repo], { out, err: out, owner, run, vault: { git: () => ({ status: 0, stdout: '' }) }, env: { CLOUDFLARE_API_TOKEN: 'from-env' } });
  const text = lines.join('\n');
  for (const v of Object.values(FAKES)) assert.ok(!text.includes(v), `a value reached the terminal: ${text}`);
  return { code, text, lines };
}
const audit = (t) => { const p = path.join(t.repo, AUDIT); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; };

describe('pnpm secrets:sync', () => {
  it('pushes every cloudflare name, in manifest order, into mood-read-proxy through wrangler on stdin', async () => {
    const t = workspace();
    try {
      const r = recorder();
      const { code, lines } = await sync(t, [], { run: r.run });
      assert.equal(code, 0);
      assert.deepEqual(r.calls.map((c) => c.args), ['CF_B', 'CF_A', 'CF_C'].map((n) => ['secret', 'put', n, '--name', WORKER]));
      for (const c of r.calls) {
        assert.equal(c.cmd, 'wrangler');
        assert.equal(c.input, FAKES[c.args[2]]);
        assert.ok(!c.args.join(' ').includes(c.input), 'the value reached argv');
      }
      assert.deepEqual(lines.filter((l) => /pushed/.test(l) && !/^secrets sync/.test(l)).map((l) => l.trim()), ['CF_B', 'CF_A', 'CF_C'].map((n) => `pushed      ${n} -> ${WORKER}`));
      assert.match(lines[lines.length - 1], /3 of 3 pushed to mood-read-proxy/);
      const events = audit(t).trim().split('\n').map((l) => JSON.parse(l));
      assert.deepEqual(events.map((e) => [e.action, e.name, e.destination, e.worker]), ['CF_B', 'CF_A', 'CF_C'].map((n) => ['push', n, 'cloudflare', WORKER]));
      for (const v of Object.values(FAKES)) assert.ok(!audit(t).includes(v));
    } finally { t.done(); }
  });

  it('filters to the cloudflare destination only', () => {
    const m = { secrets: [entry('A', ['local']), entry('B', ['cloudflare', 'local']), entry('C', ['github-actions']), entry('D', ['cloudflare'])] };
    assert.deepEqual(cloudflareNames(m), ['B', 'D']);
  });

  it('--dry-run lists the names and pushes nothing', async () => {
    const t = workspace({ set: ['CF_B', 'GH_ONLY', 'CF_A'] });
    try {
      const { code, text, lines } = await sync(t, ['--dry-run']);
      assert.equal(code, 0);
      assert.match(text, /--dry-run: 3 names would go to mood-read-proxy, nothing pushed/);
      assert.deepEqual(lines.filter((l) => /would push/.test(l)).map((l) => l.trim().split(/\s+/)[2]), ['CF_B', 'CF_A', 'CF_C']);
      assert.match(text, /CF_C {2}\(not set in the vault: node scripts\/secrets\.mjs set CF_C\)/);
      assert.ok(!/GH_ONLY/.test(text));
      assert.equal(audit(t), '');
    } finally { t.done(); }
  });

  it('a name missing from the vault stops the run before any push, naming what to set', async () => {
    const t = workspace({ set: ['CF_B', 'CF_C'] });
    try {
      const { code, text } = await sync(t, [], { run: never });
      assert.equal(code, 1);
      assert.match(text, /not set {2}CF_A: node scripts\/secrets\.mjs set CF_A/);
      assert.match(text, /1 of 3 not set in the vault; nothing pushed/);
      assert.ok(!/CF_B: node/.test(text));
      assert.equal(audit(t), '');
    } finally { t.done(); }
  });

  it('says why a push did not land, one line for that name, and carries on, never printing a value', async () => {
    const t = workspace();
    try {
      const r = recorder((cmd, args) => ({ status: args[2] === 'CF_A' ? 1 : 0 }));
      const { code, text } = await sync(t, [], { run: r.run });
      assert.equal(code, 1);
      assert.equal(r.calls.length, 3);
      assert.match(text, /not pushed {2}CF_A: CF_A -> cloudflare: wrangler exited 1/);
      assert.match(text, /2 of 3 pushed to mood-read-proxy; 1 not/);
    } finally { t.done(); }
  });

  it('is refused in a contributor checkout, before reading the vault or running anything', async () => {
    const t = workspace();
    try {
      for (const argv of [[], ['--dry-run']]) {
        const { code, text } = await sync(t, argv, { owner: () => false, run: never });
        assert.equal(code, 1);
        assert.match(text, /secrets sync: refused in a contributor checkout: sinks run in owner mode only/);
        assert.ok(!/CF_/.test(text));
      }
      assert.equal(audit(t), '');
    } finally { t.done(); }
  });

  it('refuses an unknown argument', async () => {
    const t = workspace();
    try {
      const { code, text } = await sync(t, ['--to', 'vercel']);
      assert.equal(code, 64);
      assert.match(text, /usage: node scripts\/secrets-sync\.mjs/);
    } finally { t.done(); }
  });
});

describe('the pinned wrangler', () => {
  it('runs the checkout\'s wrangler through node when it is installed, and leaves other commands alone', () => {
    const r = recorder();
    const run = pinnedRunner(ROOT, r.run);
    run('wrangler', ['secret', 'put', 'X', '--name', WORKER], { input: 'fake', cwd: ROOT });
    run('gh', ['secret', 'set', 'X'], { input: 'fake' });
    assert.equal(r.calls[0].cmd, process.execPath);
    assert.deepEqual(r.calls[0].args, [path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'secret', 'put', 'X', '--name', WORKER]);
    assert.equal(r.calls[0].input, 'fake');
    assert.equal(r.calls[1].cmd, 'gh');
    const bare = recorder();
    pinnedRunner(path.join(os.tmpdir(), 'no such checkout'), bare.run)('wrangler', ['--version'], {});
    assert.equal(bare.calls[0].cmd, 'wrangler');
  });

  it('targets the Worker proxy/wrangler.jsonc names', () => {
    const text = fs.readFileSync(path.join(ROOT, 'proxy', 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(JSON.parse(text).name, WORKER);
  });
});

describe('the manifest', () => {
  it('sends the R2/S3 keys to cloudflare and keeps wrangler\'s own credentials out of the Worker', () => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'nexus.secrets.json'), 'utf8'));
    const names = cloudflareNames(m);
    for (const n of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
      assert.ok(!names.includes(n), `${n} goes to the Worker`);
      assert.deepEqual(m.secrets.find((e) => e.name === n).destinations, ['local', 'github-actions']);
    }
    for (const n of ['CLOUDFLARE_S3_ACCESS_KEY_ID', 'CLOUDFLARE_S3_SECRET_ACCESS_KEY', 'S3_API_ENDPOINT']) assert.ok(names.includes(n), `${n} does not go to the Worker`);
  });
});
