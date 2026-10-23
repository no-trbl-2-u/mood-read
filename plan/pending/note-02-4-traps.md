---
date: 2026-10-23
---
## Notes
- 2026-10-23 · from 02.3 and 02.4 (heads down) · Two traps, no footgun list to hold them yet (`identity/footguns.md` is not adopted): (1) settle.mjs closes a chunk but leaves its id in a later chunk's `needs` in the same spec, so plan-check goes red at settle; seen at 02.2 and 02.3, dropped by hand both times. Settle should drop a closed need from every `needs` it rewrites. (2) On Windows `wrangler` is a .cmd shim, so a sink that spawns it without a shell gets "not found": `secrets.mjs push --to cloudflare` (and likely `vercel`) still has it; `secrets-sync.mjs` works around it by running `node_modules/wrangler/bin/wrangler.js` with node.
