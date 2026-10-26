// After `expo export -p web`: move the assets a package ships out of dist/assets/node_modules/. The export keeps
// each one at its package path (assets/node_modules/.pnpm/<pkg>/node_modules/<name>/...), and `wrangler pages
// deploy` never uploads a node_modules path, so on mood-read.pages.dev every such request 404s while it works from
// a local folder. They land under assets/vendor/<name>/... and every reference in the export is rewritten to match.
// Usage: node scripts/web-export-paths.mjs [dist-dir]   (default dist; dist-owner for the owner-tools build)
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VENDOR = 'vendor';

// assets/node_modules/.pnpm/expo-router@1_h/node_modules/expo-router/assets/x.png -> assets/vendor/expo-router/assets/x.png
// (a non-pnpm layout, assets/node_modules/<name>/..., is handled by the second pattern).
const PNPM = /assets\/node_modules\/\.pnpm\/[^/]+\/node_modules\/((?:@[^/]+\/)?[^/]+)\//g;
const PLAIN = /assets\/node_modules\/((?:@[^/]+\/)?[^/]+)\//g;

export const rewritePath = (text) => text.replace(PNPM, `assets/${VENDOR}/$1/`).replace(PLAIN, `assets/${VENDOR}/$1/`);

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

const TEXT = new Set(['.js', '.html', '.json', '.css', '.map']);

// Returns the number of files moved. Throws when a node_modules path is still in the export afterwards.
export function flattenPackageAssets(dist) {
  const from = path.join(dist, 'assets', 'node_modules');
  let moved = 0;
  if (existsSync(from)) {
    for (const file of walk(from)) {
      const rel = path.relative(dist, file).split(path.sep).join('/');
      const to = path.join(dist, rewritePath(rel));
      if (to === file) throw new Error(`cannot move ${rel} out of node_modules`);
      cpSync(file, to);
      moved += 1;
    }
    rmSync(from, { recursive: true, force: true });
    for (const file of walk(dist)) {
      if (!TEXT.has(path.extname(file).toLowerCase())) continue;
      const before = readFileSync(file, 'utf8');
      const after = rewritePath(before);
      if (after !== before) writeFileSync(file, after);
    }
  }
  const files = walk(dist);
  const left = files.filter((f) => /(^|[\\/])node_modules([\\/]|$)/.test(path.relative(dist, f)));
  const named = files.filter((f) => TEXT.has(path.extname(f).toLowerCase()) && /assets\/node_modules\//.test(readFileSync(f, 'utf8')));
  if (left.length || named.length) {
    throw new Error(`node_modules still in the web export: ${[...left, ...named].map((f) => path.relative(dist, f)).join(', ')}`);
  }
  return moved;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = path.resolve(process.argv[2] ?? 'dist');
  if (!existsSync(dist) || !statSync(dist).isDirectory()) {
    console.error(`web-export-paths: no export at ${dist}`);
    process.exit(1);
  }
  try {
    console.log(`web-export-paths: moved ${flattenPackageAssets(dist)} package assets to assets/${VENDOR}/`);
  } catch (err) {
    console.error(`web-export-paths: ${err.message}`);
    process.exit(1);
  }
}
