// proxy/: the Worker mood-read-proxy answers GET /health with 200 "ok" and everything else with 404 (02.4, A4).
// node:test, no deps; the handler runs in node (type stripping), never through wrangler.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import worker, { handle } from '../../proxy/src/index.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const req = (p, method = 'GET') => new Request(`https://mood-read-proxy.example.workers.dev${p}`, { method });

describe('the proxy worker', () => {
  it('answers GET /health with 200 ok', async () => {
    const res = worker.fetch(req('/health'));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  });

  it('answers anything else with 404', () => {
    for (const r of [req('/'), req('/health/x'), req('/score'), req('/health', 'POST')]) assert.equal(handle(r).status, 404);
  });

  it('is configured as mood-read-proxy in proxy/wrangler.jsonc, its main the handler', () => {
    const text = fs.readFileSync(path.join(ROOT, 'proxy', 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const config = JSON.parse(text);
    assert.equal(config.name, 'mood-read-proxy');
    assert.equal(config.main, 'src/index.ts');
    assert.ok(fs.existsSync(path.join(ROOT, 'proxy', config.main)));
    assert.match(config.compatibility_date, /^\d{4}-\d{2}-\d{2}$/);
  });
});
