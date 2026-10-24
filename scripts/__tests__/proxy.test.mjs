// proxy/: the Worker mood-read-proxy (02.4 set it up; 01.2 made it the scoring proxy). Its modules have their own
// tests beside them (proxy/src/*.test.ts, run in this same leg); this checks the Worker's face and its config.
// node:test, no deps; the handler runs in node (type stripping), never through wrangler.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import worker, { handle } from '../../proxy/src/index.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const req = (p, method = 'GET') => new Request(`https://mood-read-proxy.example.workers.dev${p}`, { method });
const config = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'proxy', 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));

describe('the proxy worker', () => {
  it('answers GET /health with 200 ok', async () => {
    const res = await worker.fetch(req('/health'));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  });

  it('answers anything else with 404', async () => {
    for (const r of [req('/'), req('/health/x'), req('/score'), req('/health', 'POST')]) assert.equal((await handle(r)).status, 404);
  });

  it('is configured as mood-read-proxy in proxy/wrangler.jsonc, its main the handler', () => {
    const c = config();
    assert.equal(c.name, 'mood-read-proxy');
    assert.equal(c.main, 'src/index.ts');
    assert.ok(fs.existsSync(path.join(ROOT, 'proxy', c.main)));
    assert.match(c.compatibility_date, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps Workers Logs off, so no request detail is kept (the privacy policy)', () => {
    assert.equal(config().observability?.enabled, false);
  });

  it('holds the monthly cap as one config value, $20, and declares its Durable Objects with their migration', () => {
    const c = config();
    assert.equal(c.vars.MONTHLY_CAP_USD, '20');
    const bindings = Object.fromEntries(c.durable_objects.bindings.map((b) => [b.name, b.class_name]));
    assert.deepEqual(bindings, { BOOK_JOBS: 'BookJob', SPEND_METER: 'SpendMeter', PRESCORED: 'PrescoreIndex' });
    assert.deepEqual(c.migrations.flatMap((m) => m.new_sqlite_classes ?? []).sort(), ['BookJob', 'PrescoreIndex', 'SpendMeter']);
  });

  it('carries no secret in its config: the keys are Worker secrets only', () => {
    const text = fs.readFileSync(path.join(ROOT, 'proxy', 'wrangler.jsonc'), 'utf8');
    assert.doesNotMatch(text, /sk-[A-Za-z0-9_-]{10,}/);
    assert.equal(config().vars.OPENAI_API_KEY, undefined);
    assert.equal(config().vars.BRAVE_SEARCH_API_KEY, undefined);
    assert.equal(config().vars.PRESCORE_TOKEN, undefined);
  });
});
