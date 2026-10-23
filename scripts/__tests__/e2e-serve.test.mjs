// e2e/serve.mjs (the e2e leg's static server over dist/): a file in the root is served, a client route with no
// extension falls back to index.html, a missing asset is a 404, nothing outside the root is reachable, a malformed
// URL is a 400; and over a real socket on a temp root the server answers the same way.
// node:test, no deps.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { contentType, createStaticServer, resolveRequest } from '../../e2e/serve.mjs';

const root = path.resolve(os.tmpdir(), 'serve-root');
const files = new Set([path.join(root, 'index.html'), path.join(root, '_expo', 'app.js'), path.join(root, 'favicon.ico')]);
const exists = (p) => files.has(p);
const resolve = (url) => resolveRequest(root, url, exists);

describe('resolving a request', () => {
  it('serves a file that exists', () => {
    assert.deepEqual(resolve('/_expo/app.js'), { status: 200, file: path.join(root, '_expo', 'app.js') });
    assert.deepEqual(resolve('/favicon.ico?v=1'), { status: 200, file: path.join(root, 'favicon.ico') });
  });

  it('falls back to index.html for the root and for client routes', () => {
    for (const url of ['/', '/book/sample-1', '/book/sample-1/', '/book/a%20b?x=1#h']) {
      assert.deepEqual(resolve(url), { status: 200, file: path.join(root, 'index.html') }, url);
    }
  });

  it('is a 404 for a missing asset, not the app shell', () => {
    assert.deepEqual(resolve('/_expo/missing.js'), { status: 404 });
  });

  it('never reaches outside the root', () => {
    for (const url of ['/../secret', '/%2e%2e/secret.txt', '/..%5C..%5Csecret.txt', '/_expo/%2e%2e%2f%2e%2e%2fsecret.txt']) {
      const hit = resolve(url);
      assert.ok(hit.status !== 200 || hit.file.startsWith(root + path.sep), `${url} -> ${JSON.stringify(hit)}`);
      assert.ok(!hit.file || hit.file === path.join(root, 'index.html'), `${url} -> ${JSON.stringify(hit)}`);
    }
  });

  it('is a 400 for a malformed URL or a NUL byte', () => {
    assert.deepEqual(resolve('/%E0%A4%A'), { status: 400 });
    assert.deepEqual(resolve('/a%00.js'), { status: 400 });
  });

  it('is a 404 when there is no index.html', () => {
    assert.deepEqual(resolveRequest(root, '/book/1', () => false), { status: 404 });
  });

  it('names content types', () => {
    assert.equal(contentType('a.html'), 'text/html; charset=utf-8');
    assert.equal(contentType('a.JS'), 'text/javascript; charset=utf-8');
    assert.equal(contentType('a.bin'), 'application/octet-stream');
  });
});

describe('the server over a socket', () => {
  let dir;
  let server;
  let base;

  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'serve-'));
    mkdirSync(path.join(dir, '_expo'));
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>shell</title>');
    writeFileSync(path.join(dir, '_expo', 'app.js'), 'console.log(1);');
    server = createStaticServer(dir);
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((done) => server.close(done));
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves files, the SPA fallback and 404s', async () => {
    const js = await fetch(`${base}/_expo/app.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);
    assert.equal(await js.text(), 'console.log(1);');

    const route = await fetch(`${base}/book/sample-1`);
    assert.equal(route.status, 200);
    assert.match(await route.text(), /shell/);

    const missing = await fetch(`${base}/_expo/nope.js`);
    assert.equal(missing.status, 404);
    await missing.text();

    const post = await fetch(`${base}/`, { method: 'POST' });
    assert.equal(post.status, 405);
    await post.text();
  });
});
