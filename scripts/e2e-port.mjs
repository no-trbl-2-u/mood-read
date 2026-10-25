// Picks a port for the hermetic e2e's static server so two worktrees' gates never collide on the same port
// (plan/AUDIT.md, [5.4]). `seedPort` derives a stable starting point from the worktree's own path (so repeat
// runs in the same worktree tend to reuse the same port); `pickPort` claims a free one starting there.
//
// A socket bind-then-close probe alone races: two processes can both see a port as free in the gap between
// one releasing it and the other (or the real server) binding it. `claimPort`'s exclusive file create is
// atomic across processes on one host, so two concurrent pickers never settle on the same port even when
// their seeds collide; the socket probe still guards against something unrelated already listening there.
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { closeSync, openSync, statSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE_PORT = 4173;
const SPREAD = 500;
// Longer than any one e2e run has ever taken: a lock older than this is a crashed process's leftover, safe
// for a later picker to reclaim rather than being blocked by it forever.
const STALE_MS = 6 * 60 * 60 * 1000;

export function seedPort(cwd) {
  return BASE_PORT + (createHash('sha1').update(cwd).digest()[0] % SPREAD);
}

export function isFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

function lockPath(port) {
  return path.join(os.tmpdir(), `mood-read-e2e-port-${port}.lock`);
}

// Exclusive create ('wx') fails with EEXIST when another process holds the same lock — the one atomic
// cross-process check available without a shared server. A stale lock (its owner crashed before exit could
// release it) is reclaimed rather than blocking the port forever.
export function claimPort(port, { now = Date.now, stale = STALE_MS } = {}) {
  const p = lockPath(port);
  const create = () => {
    try {
      closeSync(openSync(p, 'wx'));
      return true;
    } catch {
      return false;
    }
  };
  if (create()) {
    process.once('exit', () => release(port));
    return true;
  }
  try {
    if (now() - statSync(p).mtimeMs < stale) return false;
    unlinkSync(p);
  } catch {
    return false;
  }
  if (!create()) return false;
  process.once('exit', () => release(port));
  return true;
}

export function release(port) {
  try {
    unlinkSync(lockPath(port));
  } catch {
    // Already gone — nothing to do.
  }
}

export async function pickPort(seed, { tries = 50, claim = claimPort, probe = isFree } = {}) {
  for (let port = seed; port < seed + tries; port++) {
    if (!claim(port)) continue;
    if (await probe(port)) return port;
    release(port);
  }
  return seed;
}
