// A small static server over the web build (dist/) for the hermetic e2e: Node built-ins only, localhost only.
// A path that names a file in dist/ serves that file; failing that, a `_redirects` file (Cloudflare Pages'
// own config, copied from public/) decides the rest — the app's known routes rewrite to the root at 200
// (never to /index.html: see parseRedirects below). Failing that, a `404.html` at the root answers any
// unmatched path at a real 404, the same built-in Cloudflare Pages convention (plan/CRITIQUE.md pass 13).
// With neither present, a path with no file extension falls back to index.html, the single-page app; a
// missing asset is a 404, so the smoke walk sees it.
// Usage: node e2e/serve.mjs [port]   (default 4173; root is dist/ beside this folder, or E2E_DIST: the owner-tools
// build in dist-owner/, scripts/e2e-owner.mjs)
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Reserved Cloudflare Pages config files: never served as content, only read for behavior (below).
const RESERVED = new Set(['/_headers', '/_redirects']);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

export const contentType = (file) => TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

// Resolve a request URL to what to serve: { status: 200, file } or { status: 400 | 403 | 404 }.
// `exists` is injectable so the logic is testable without a disk. `redirects` (parseRedirects' output)
// is checked only once no real asset matches the path, same precedence Cloudflare Pages itself gives
// `_redirects` over static assets.
export function resolveRequest(root, url, exists = isFile, redirects = []) {
  const base = path.resolve(root);
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return { status: 400 };
  }
  if (pathname.includes('\0')) return { status: 400 };
  const target = path.resolve(base, '.' + path.posix.normalize('/' + pathname));
  if (target !== base && !target.startsWith(base + path.sep)) return { status: 403 };
  // The root path (`/`) — and any redirect destination of `/` — means index.html, the one real
  // asset there; never the bare directory `isFile` would reject.
  const asIndex = (p) => (p === base ? path.join(base, 'index.html') : p);
  const asset = asIndex(target);
  if (exists(asset)) return { status: 200, file: asset };
  const rule = redirectFor(redirects, pathname);
  if (rule) {
    const dest = asIndex(path.resolve(base, '.' + path.posix.normalize('/' + rule.to)));
    return exists(dest) ? { status: rule.status, file: dest } : { status: 404 };
  }
  // Cloudflare Pages' own convention: a 404.html at the root answers any path nothing else
  // matched, at a real 404 — not just an extensionless one, and regardless of `_redirects`.
  const notFound = path.join(base, '404.html');
  if (exists(notFound)) return { status: 404, file: notFound };
  if (path.posix.extname(pathname) === '') {
    const index = path.join(base, 'index.html');
    return exists(index) ? { status: 200, file: index } : { status: 404 };
  }
  return { status: 404 };
}

/**
 * A single byte range from a Range header, as Cloudflare Pages answers one (media elements seek with them):
 * null for no header or a form this server does not split (several ranges), 'unsatisfiable' for one outside
 * the file, else the inclusive { start, end }.
 */
export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

// A Cloudflare Pages `_headers` file: blank/`#` lines ignored, an unindented line starts a path pattern, each
// indented `Name: value` line under it is a header that pattern adds. `/*` (or `/foo/*`) matches a prefix; any
// other pattern matches only that exact path. Later matching rules overwrite earlier ones for the same name,
// same as Cloudflare's own rule merging.
export function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    if (!current) continue;
    const i = line.indexOf(':');
    if (i === -1) continue;
    const name = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (name) current.headers[name] = value;
  }
  return rules;
}

function matchesPattern(pattern, pathname) {
  if (pattern === pathname) return true;
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return pathname === prefix || pathname.startsWith(prefix + '/');
  }
  return false;
}

export function headersFor(rules, pathname) {
  const out = {};
  for (const rule of rules) if (matchesPattern(rule.pattern, pathname)) Object.assign(out, rule.headers);
  return out;
}

// A Cloudflare Pages `_redirects` file: blank/`#` lines ignored, every other line is `<pattern> <to>
// [status]` (whitespace-separated); status defaults to 301 (Cloudflare's own default) when omitted.
// Rules are checked in order, first match wins (`redirectFor`), the same pattern language `_headers`
// uses (`matchesPattern`): `/foo/*` matches `/foo` and everything under it, anything else matches
// exactly. Cloudflare only accepts 200/301/302/303/307/308 as a rule's status — not 404, so a rule
// can rewrite but never itself serve a 404 (that's `404.html`'s job, resolveRequest's fallback below);
// and a destination of `/index.html` is a footgun on the real platform (an auto redirect strips the
// `/index.html` back to `/`, turning a 200 rewrite into a loop-breaking 301 and disabling any splat
// rule that depends on it outright as an "infinite loop") — destinations should be `/`, not `/index.html`.
export function parseRedirects(text) {
  const rules = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const [pattern, to, status] = line.split(/\s+/);
    if (!pattern || !to) continue;
    rules.push({ pattern, to, status: status ? Number(status) : 301 });
  }
  return rules;
}

export function redirectFor(rules, pathname) {
  return rules.find((rule) => matchesPattern(rule.pattern, pathname)) ?? null;
}

export function createStaticServer(root) {
  const base = path.resolve(root);
  const headersPath = path.join(base, '_headers');
  const headerRules = existsSync(headersPath) ? parseHeaders(readFileSync(headersPath, 'utf8')) : [];
  const redirectsPath = path.join(base, '_redirects');
  const redirectRules = existsSync(redirectsPath) ? parseRedirects(readFileSync(redirectsPath, 'utf8')) : [];
  return createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      pathname = '';
    }
    if (RESERVED.has(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404\n');
      return;
    }
    const hit = resolveRequest(root, req.url ?? '/', undefined, redirectRules);
    if (!hit.file) {
      res.writeHead(hit.status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`${hit.status}\n`);
      return;
    }
    const size = statSync(hit.file).size;
    const headers = {
      'Content-Type': contentType(hit.file),
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
      ...headersFor(headerRules, pathname),
    };
    const range = parseRange(req.headers.range, size);
    if (range === 'unsatisfiable') {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    if (range) {
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
      headers['Content-Length'] = String(range.end - range.start + 1);
    } else headers['Content-Length'] = String(size);
    res.writeHead(range ? 206 : hit.status, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(hit.file, range ?? {}).on('error', () => res.destroy()).pipe(res);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', process.env.E2E_DIST || 'dist');
  const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
  if (!isFile(path.join(root, 'index.html'))) {
    console.error(`serve: no ${path.join(root, 'index.html')}; run pnpm build first`);
    process.exit(1);
  }
  createStaticServer(root).listen(port, '127.0.0.1', () => {
    console.log(`serve: dist/ on http://127.0.0.1:${port}`);
  });
}
