# Notes

> The notes inbox: settle puts each pending note first.

- 2026-10-23 · from 02.3 and 02.4 (heads down) · Two traps, no footgun list to hold them yet (`identity/footguns.md` is not adopted): (1) settle.mjs closes a chunk but leaves its id in a later chunk's `needs` (02.4 after 02.2 and 02.3, and 05.1 across specs after 02.4), so plan-check goes red at settle; dropped by hand each time. Settle should drop a closed need from every `needs` it rewrites. (2) On Windows `wrangler` is a .cmd shim, so a sink that spawns it without a shell gets "not found": `secrets.mjs push --to cloudflare` (and likely `vercel`) still has it; `secrets-sync.mjs` works around it by running `node_modules/wrangler/bin/wrangler.js` with node.

- [needs-user-call] secret request 01.24: set ANTHROPIC_API_KEY in your terminal or the GUI's vault (never in a session), and 01.24 is ready again. Then delete this row.
  - ANTHROPIC_API_KEY: The scoring proxy's Claude API key (01.20, D15): a Worker secret of mood-read-proxy, never in the app Get it: https://platform.claude.com/settings/keys. Goes to: local, cloudflare. Set it: `node scripts/secrets.mjs set ANTHROPIC_API_KEY`.
