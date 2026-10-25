// e2e-port.mjs: seedPort derives a stable, in-range port from a worktree path; claimPort atomically claims a
// port across processes (reclaiming a stale lock rather than blocking forever) so pickPort's probe-then-use
// never races another picker onto the same port; pickPort falls back to the seed if every try is unclaimable
// or busy.
// node:test, no deps. claimPort/release touch real lock files under os.tmpdir(), on high, unlikely-to-be-real
// ports so a genuinely running e2e server never collides with the test.
import assert from 'node:assert/strict';
import { existsSync, unlinkSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { claimPort, isFree, pickPort, release, seedPort } from '../e2e-port.mjs';

const lockPath = (port) => path.join(os.tmpdir(), `mood-read-e2e-port-${port}.lock`);
const TEST_PORT = 59000;

describe('seedPort', () => {
  it('is deterministic for the same path', () => {
    assert.equal(seedPort('/worktrees/a'), seedPort('/worktrees/a'));
  });

  it('differs for most distinct paths', () => {
    assert.notEqual(seedPort('/worktrees/a'), seedPort('/worktrees/b'));
  });

  it('stays in the 4173-4672 range', () => {
    for (const cwd of ['/a', '/worktrees/arcturus', '/home/runner/work/mood-read/mood-read']) {
      const port = seedPort(cwd);
      assert.ok(port >= 4173 && port < 4673, `${cwd} -> ${port}`);
    }
  });
});

describe('claimPort / release', () => {
  it('claims a port with no existing lock', () => {
    release(TEST_PORT);
    assert.equal(claimPort(TEST_PORT), true);
    assert.ok(existsSync(lockPath(TEST_PORT)));
    release(TEST_PORT);
  });

  it('refuses a second claim while the lock is fresh', () => {
    release(TEST_PORT + 1);
    assert.equal(claimPort(TEST_PORT + 1), true);
    assert.equal(claimPort(TEST_PORT + 1), false);
    release(TEST_PORT + 1);
  });

  it('reclaims a lock older than the staleness window', () => {
    const port = TEST_PORT + 2;
    release(port);
    assert.equal(claimPort(port), true);
    const old = Date.now() - 10_000;
    utimesSync(lockPath(port), old / 1000, old / 1000);
    assert.equal(claimPort(port, { now: () => Date.now(), stale: 5_000 }), true);
    release(port);
  });

  it('release is a no-op when nothing is claimed', () => {
    assert.doesNotThrow(() => release(TEST_PORT + 3));
  });
});

describe('pickPort', () => {
  it('returns the seed when it is claimable and free', async () => {
    const port = await pickPort(5000, { claim: () => true, probe: async (p) => p === 5000 });
    assert.equal(port, 5000);
  });

  it('skips a port it cannot claim, without probing it', async () => {
    const probed = [];
    const port = await pickPort(5000, {
      claim: (p) => p !== 5000,
      probe: async (p) => {
        probed.push(p);
        return true;
      },
    });
    assert.equal(port, 5001);
    assert.deepEqual(probed, [5001]);
  });

  it('releases and moves on when a claimed port is not actually free', async () => {
    const port = await pickPort(5000, {
      claim: () => true,
      probe: async (p) => p === 5002,
    });
    assert.equal(port, 5002);
  });

  it('falls back to the seed when every try is unclaimable', async () => {
    const port = await pickPort(5000, { tries: 3, claim: () => false });
    assert.equal(port, 5000);
  });
});

describe('isFree', () => {
  it('reports a high, unlikely-to-be-bound port as free', async () => {
    assert.equal(await isFree(58312), true);
  });
});
