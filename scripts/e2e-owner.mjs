// The owner-tools e2e (05.21, spec 05 A23): a second web build with owner tools on (MOOD_READ_OWNER_TOOLS=1, as
// eas.json's preview profile sets it), exported to dist-owner/, and e2e/owner-tools.spec.ts run over it. The gate's
// own build (`pnpm build`, the one deployed) has them off, and the same spec checks that there; this run is kept out
// of `pnpm verify` so the gate builds once. Usage: pnpm e2e:owner
import { spawnSync } from 'node:child_process';

// Fixed commands, no outside input: one string through the shell, so pnpm resolves on Windows too.
const run = (args, env) => {
  const r = spawnSync(['pnpm', 'exec', ...args].join(' '), { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(['expo', 'export', '-p', 'web', '--output-dir', 'dist-owner'], { MOOD_READ_OWNER_TOOLS: '1' });
run(['node', 'scripts/web-export-paths.mjs', 'dist-owner']);
run(['playwright', 'test', 'e2e/owner-tools.spec.ts'], { E2E_DIST: 'dist-owner', E2E_OWNER_TOOLS: '1' });
