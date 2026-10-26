# Notes

> The notes inbox: settle puts each pending note first.

- 2026-10-23 · from 02.3 and 02.4 (heads down) · Two traps, no footgun list to hold them yet (`identity/footguns.md` is not adopted): (1) settle.mjs closes a chunk but leaves its id in a later chunk's `needs` (02.4 after 02.2 and 02.3, and 05.1 across specs after 02.4), so plan-check goes red at settle; dropped by hand each time. Settle should drop a closed need from every `needs` it rewrites. (2) On Windows `wrangler` is a .cmd shim, so a sink that spawns it without a shell gets "not found": `secrets.mjs push --to cloudflare` (and likely `vercel`) still has it; `secrets-sync.mjs` works around it by running `node_modules/wrangler/bin/wrangler.js` with node.

- [needs-user-call] secret request 04.1: set EXPO_TOKEN in your terminal or the GUI's vault (never in a session), and 04.1 is ready again. Then delete this row.
  - EXPO_TOKEN: EXPO / EAS Get it: no link in the manifest. Goes to: local, github-actions. Set it: `node scripts/secrets.mjs set EXPO_TOKEN`.

05.25 (closes A27) duplicated an already-shipped fix: issue #7
was closed by commit 1b32f53 ("the web build keeps one book on
the device, so a book that lands replaces the one there and
says so in Downloads"), which built exactly this —
`src/lib/book-removal.ts` (`booksToEvict`, `newlyOnDevice`,
`enforceLimit`) wired from `src/lib/library-manage.ts`, capping
web at `MAX_DEVICE_BOOKS = 1` for import, LibriVox download and
"Find the file" alike, with `e2e/library-manage.spec.ts`
covering the swap. `/triage` opened a second pending chunk on
the same issue before (or around the same time as) that fix
landed. No code change: this run's gate (plan:check,
secrets:scan, typecheck, lint, test:run, test:scripts, build,
e2e) is green on main as-is, confirming A27 already holds.
