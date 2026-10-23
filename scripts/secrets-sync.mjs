#!/usr/bin/env node
// scripts/secrets-sync.mjs: `pnpm secrets:sync`, every name the manifest sends to `cloudflare`, pushed into the Worker
// mood-read-proxy (proxy/wrangler.jsonc). The rule: the model sees names, never values, so nothing here prints one.
//
//   node scripts/secrets-sync.mjs [--dry-run] [--root <dir>]
//
// For each name in nexus.secrets.json whose destinations include `cloudflare`, in manifest order, it runs the one path
// a value already has to a Worker: `secrets.mjs push NAME --to cloudflare --worker mood-read-proxy` (the cloudflare
// sink in scripts/secrets-sinks.mjs: `wrangler secret put`, the value on stdin, each push in the audit record). One
// line per name, `pushed` or why not. A name not set in the vault stops the run before any push, naming what to
// `set`; `--dry-run` lists the names and pushes nothing. Owner mode only, as every sink is.
//
// wrangler is the repo's own (the devDependency 02.3 pins), run as `node node_modules/wrangler/bin/wrangler.js`, so
// it is found on every platform (a bare `wrangler` is a .cmd shim on Windows, which a spawn without a shell misses).
// Its own credentials come from its environment or `wrangler login`; from the vault:
//   node scripts/secrets.mjs run --only CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID -- pnpm secrets:sync
// `run` (the runner) and `owner` are the seams tests stub: no test runs wrangler.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isOwner, localSettings, primaryRoot } from './owner.mjs';
import { MANIFEST, readManifest } from './plan/secrets-manifest.mjs';
import { main as secrets } from './secrets.mjs';
import { spawnRunner } from './secrets-sinks.mjs';
import { openVault, sinkRefusal } from './secrets-vault.mjs';

export const WORKER = 'mood-read-proxy';
export const DESTINATION = 'cloudflare';
export const USAGE = 'usage: node scripts/secrets-sync.mjs [--dry-run] [--root <dir>]';

function topLevel() {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return process.cwd(); }
}

function vaultRoot(fallback) {
  try { return primaryRoot(fallback); } catch { return fallback; }
}

/** The sinks' runner, with `wrangler` resolved to the checkout's pinned copy when it is installed. */
export function pinnedRunner(root, run = spawnRunner) {
  const bin = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  return (cmd, args, opts) => (cmd === 'wrangler' && fs.existsSync(bin) ? run(process.execPath, [bin, ...args], opts) : run(cmd, args, opts));
}

/** The manifest's names bound for `cloudflare`, in manifest order. */
export function cloudflareNames(manifest) {
  return manifest.secrets.filter((e) => Array.isArray(e.destinations) && e.destinations.includes(DESTINATION)).map((e) => e.name);
}

export async function main(argv, { out = (s) => process.stdout.write(`${s}\n`), err = (s) => process.stderr.write(`${s}\n`), owner, run, vault: vaultOpts = {}, env = process.env } = {}) {
  const args = [...argv];
  const flag = (name) => { const i = args.indexOf(name); if (i === -1) return false; args.splice(i, 1); return true; };
  const opt = (name) => { const i = args.indexOf(name); if (i === -1) return null; const v = args[i + 1]; args.splice(i, 2); return v ?? ''; };
  const dry = flag('--dry-run');
  const rootArg = opt('--root');
  if (args.length || rootArg === '') { err(USAGE); return 64; }
  const root = path.resolve(rootArg ?? topLevel());
  const vroot = rootArg ? root : vaultRoot(root);

  if (!(owner ? owner() : isOwner(root))) { err(sinkRefusal('sync')); return 1; }

  const current = readManifest(path.join(root, MANIFEST));
  if (!current) { err(`secrets sync: no ${MANIFEST} here: nothing names a secret for ${DESTINATION}`); return 1; }
  if (current.problems.length) {
    for (const p of current.problems) err(`  ${MANIFEST}: ${p}`);
    err(`secrets sync: ${MANIFEST} is RED (${current.problems.length}); fix it first`);
    return 1;
  }
  const names = cloudflareNames(current.manifest);
  if (!names.length) { out(`secrets sync: no name in ${MANIFEST} goes to ${DESTINATION}: nothing to push`); return 0; }

  // Where each name is set, never what it is: the vault's status, names and rings only.
  let rows;
  try { rows = openVault({ root: vroot, settings: localSettings(vroot), ...vaultOpts }).status(names); } catch (e) { err(`secrets sync: ${e.message}`); return 1; }
  const set = new Set(rows.filter((r) => r.rings.length).map((r) => r.name));
  const missing = names.filter((n) => !set.has(n));

  if (dry) {
    out(`secrets sync: --dry-run: ${names.length} name${names.length === 1 ? '' : 's'} would go to ${WORKER}, nothing pushed`);
    for (const n of names) out(`  would push  ${n}${set.has(n) ? '' : '  (not set in the vault: node scripts/secrets.mjs set ' + n + ')'}`);
    return 0;
  }
  if (missing.length) {
    for (const n of missing) err(`  not set  ${n}: node scripts/secrets.mjs set ${n}`);
    err(`secrets sync: ${missing.length} of ${names.length} not set in the vault; nothing pushed`);
    return 1;
  }
  if (!env.CLOUDFLARE_API_TOKEN) out('secrets sync: CLOUDFLARE_API_TOKEN is not in the environment: wrangler uses its login (or run this through node scripts/secrets.mjs run --only CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID -- pnpm secrets:sync)');

  const runner = run ?? pinnedRunner(root);
  let failed = 0;
  for (const n of names) {
    const said = [];
    const keep = (s) => said.push(String(s));
    const code = await secrets(['push', n, '--to', DESTINATION, '--worker', WORKER, ...(rootArg ? ['--root', root] : [])], { out: keep, err: keep, owner: () => true, run: runner, vault: vaultOpts });
    if (code === 0) { out(`  pushed      ${n} -> ${WORKER}`); continue; }
    failed++;
    const why = (said[said.length - 1] ?? `push exited ${code}`).replace(/^secrets push: /, '');
    out(`  not pushed  ${n}: ${why}`);
  }
  const pushed = names.length - failed;
  (failed ? err : out)(`secrets sync: ${pushed} of ${names.length} pushed to ${WORKER}${failed ? `; ${failed} not` : ''}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
