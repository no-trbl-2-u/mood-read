// deploy-check-cloudflare.mjs: the Pages deploy for a commit is found by its commit hash, read as ready only once its
// deploy stage succeeded, and every terminal state maps to the gate's exit code. node:test, no deps, fetch injected.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EXIT, classify, exitCodeFor, matchDeployment, probeCloudflare } from '../deploy-check-cloudflare.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const dep = (over = {}) => ({
  id: 'd1234567-0000-0000-0000-000000000000',
  url: 'https://d1234567.mood-read.pages.dev',
  environment: 'production',
  created_on: '2026-10-23T10:00:00Z',
  deployment_trigger: { metadata: { commit_hash: SHA } },
  latest_stage: { name: 'deploy', status: 'success' },
  ...over,
});

describe('exit codes', () => {
  it('maps 0 ready, 1 error, 2 timeout, 3 config', () => {
    assert.deepEqual(EXIT, { ready: 0, error: 1, timeout: 2, config: 3 });
    assert.equal(exitCodeFor('ready'), 0);
    assert.equal(exitCodeFor('error'), 1);
    assert.equal(exitCodeFor('timeout'), 2);
    assert.equal(exitCodeFor('config'), 3);
  });

  it('has no code for a state still moving', () => {
    assert.equal(exitCodeFor('pending'), null);
    assert.equal(exitCodeFor('deploy:active'), null);
    assert.equal(exitCodeFor('toString'), null);
  });
});

describe('matchDeployment', () => {
  it('finds the deploy whose commit hash is the sha, and nothing for another sha', () => {
    const list = [dep({ id: 'x', deployment_trigger: { metadata: { commit_hash: OTHER } } }), dep({ id: 'y' })];
    assert.equal(matchDeployment(list, SHA).id, 'y');
    assert.equal(matchDeployment(list, 'c'.repeat(40)), undefined);
  });

  it('tolerates an empty or missing list and deploys without trigger metadata', () => {
    assert.equal(matchDeployment(undefined, SHA), undefined);
    assert.equal(matchDeployment([], SHA), undefined);
    assert.equal(matchDeployment([{ id: 'z' }, null], SHA), undefined);
  });

  it('prefers production, then the newest retry of the same commit', () => {
    const list = [
      dep({ id: 'old', created_on: '2026-10-23T10:00:00Z' }),
      dep({ id: 'preview', environment: 'preview', created_on: '2026-10-23T12:00:00Z' }),
      dep({ id: 'new', created_on: '2026-10-23T11:00:00Z' }),
    ];
    assert.equal(matchDeployment(list, SHA).id, 'new');
    assert.equal(matchDeployment([list[1]], SHA).id, 'preview');
  });
});

describe('classify', () => {
  it('is ready only once the deploy stage succeeded', () => {
    assert.deepEqual(classify(dep()), { state: 'ready', url: 'https://d1234567.mood-read.pages.dev', id: 'd1234567' });
    assert.equal(classify(dep({ latest_stage: { name: 'build', status: 'success' } })).state, 'build:success');
    assert.equal(classify(dep({ latest_stage: { name: 'deploy', status: 'active' } })).state, 'deploy:active');
    assert.equal(classify(dep({ latest_stage: undefined })).state, 'pending');
  });

  it('is an error when a stage failed or was canceled, with the dashboard link', () => {
    const failed = classify(dep({ latest_stage: { name: 'build', status: 'failure' } }), { account: 'acc', project: 'mood-read' });
    assert.equal(failed.state, 'error');
    assert.equal(failed.message, 'stage "build" failure');
    assert.equal(failed.admin, 'https://dash.cloudflare.com/acc/pages/view/mood-read/d1234567-0000-0000-0000-000000000000');
    assert.equal(classify(dep({ latest_stage: { name: 'deploy', status: 'canceled' } })).state, 'error');
  });
});

describe('probeCloudflare', () => {
  const reply = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  const args = (fetch) => ({ fetch, token: 't', account: 'acc', project: 'mood-read', sha: SHA });

  it('asks the project deployments endpoint with a bearer token', async () => {
    let seen;
    const fetch = async (url, init) => { seen = { url, init }; return { status: 200, ok: true, json: async () => ({ result: [] }) }; };
    assert.deepEqual(await probeCloudflare(args(fetch)), { state: 'pending' });
    assert.equal(seen.url, 'https://api.cloudflare.com/client/v4/accounts/acc/pages/projects/mood-read/deployments');
    assert.equal(seen.init.headers.Authorization, 'Bearer t');
  });

  it('reads the matching deploy', async () => {
    assert.equal((await probeCloudflare(args(reply(200, { result: [dep()] })))).state, 'ready');
    const failed = await probeCloudflare(args(reply(200, { result: [dep({ latest_stage: { name: 'deploy', status: 'failure' } })] })));
    assert.equal(failed.state, 'error');
  });

  it('stops on auth or a missing project, retries anything transient', async () => {
    assert.equal((await probeCloudflare(args(reply(401, {})))).state, 'config');
    assert.equal((await probeCloudflare(args(reply(403, {})))).state, 'config');
    assert.match((await probeCloudflare(args(reply(404, {})))).message, /No Pages project "mood-read"/);
    assert.equal(await probeCloudflare(args(reply(500, {}))), null);
    assert.equal(await probeCloudflare(args(async () => { throw new Error('offline'); })), null);
    assert.equal(await probeCloudflare(args(async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError('x'); } }))), null);
  });
});
