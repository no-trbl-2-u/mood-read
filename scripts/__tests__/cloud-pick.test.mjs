// The cloud `next` tick builds on main, so its pick must honour live claims from any session (a local /heads-down loop
// or another cloud run): the chunk is chosen by `tick.mjs pick --direct` (which claims it, and refuses one with a live
// claim), the agent builds exactly that chunk, and the claim is released afterwards. Before this, next.yml let the agent
// choose its own chunk with no claims check, and a scheduled run landed 05.16 while a local loop held it (2026-10-25).
// Reads the workflow file as text; offline, no git. node:test, no deps.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const next = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'next.yml'), 'utf8');

describe('next.yml picks through the claims', () => {
  it('picks and claims one chunk before the agent runs', () => {
    const pick = next.indexOf('tick.mjs pick --direct');
    const agent = next.indexOf('anthropics/claude-code-action');
    assert.ok(pick > 0, 'a step runs `node scripts/cloud/tick.mjs pick --direct`');
    assert.ok(pick < agent, 'the pick comes before the agent step');
    assert.match(next, /NEXUS_SESSION: cloud-\$\{\{ github\.run_id \}\}/);
  });

  it('tells the agent to build the picked chunk and nothing else, and to stop when none was picked', () => {
    assert.match(next, /steps\.pick\.outputs\.id/);
    assert.match(next, /Build exactly that chunk/);
    assert.doesNotMatch(next, /Pick the next chunk whose needs are done/, 'the agent no longer chooses its own chunk');
  });

  it('releases the claim when the tick ends, shipped or not', () => {
    assert.match(next, /always\(\)[^\n]*\n?[^\n]*/);
    assert.match(next, /tick\.mjs release/);
  });
});
