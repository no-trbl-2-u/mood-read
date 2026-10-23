// A small static server over the web build (dist/) for the hermetic e2e: Node built-ins only, localhost only.
// A path that names a file in dist/ serves that file; a path with no file extension (a client route such as
// /book/abc) falls back to index.html, the single-page app; a missing asset is a 404, so the smoke walk sees it.
// Usage: node e2e/serve.mjs [port]   (default 4173; root is dist/ beside this folder)
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
// `exists` is injectable so the logic is testable without a disk.
export function resolveRequest(root, url, exists = isFile) {
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
  if (target !== base && exists(target)) return { status: 200, file: target };
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

export function createStaticServer(root) {
  return createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const hit = resolveRequest(root, req.url ?? '/');
    if (hit.status !== 200) {
      res.writeHead(hit.status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`${hit.status}\n`);
      return;
    }
    const size = statSync(hit.file).size;
    const headers = { 'Content-Type': contentType(hit.file), 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    const range = parseRange(req.headers.range, size);
    if (range === 'unsatisfiable') {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    if (range) {
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
      headers['Content-Length'] = String(range.end - range.start + 1);
    } else headers['Content-Length'] = String(size);
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(hit.file, range ?? {}).on('error', () => res.destroy()).pipe(res);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
  if (!isFile(path.join(root, 'index.html'))) {
    console.error(`serve: no ${path.join(root, 'index.html')}; run pnpm build first`);
    process.exit(1);
  }
  createStaticServer(root).listen(port, '127.0.0.1', () => {
    console.log(`serve: dist/ on http://127.0.0.1:${port}`);
  });
}
