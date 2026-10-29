---
date: 2026-10-29
---
## Notes
- [needs-user-call] secret request 01.26: set OPENAI_API_KEY, BRAVE_SEARCH_API_KEY, PRESCORE_TOKEN in your terminal or the GUI's vault (never in a session), and 01.26 is ready again. Then delete this row.
  - OPENAI_API_KEY: The scoring proxy's OpenAI key (01.2): a Worker secret of mood-read-proxy, never in the app Get it: no link in the manifest. Goes to: local, github-actions, cloudflare. Set it: `node scripts/secrets.mjs set OPENAI_API_KEY`.
  - BRAVE_SEARCH_API_KEY: The scoring proxy's Brave Search key (01.2): a Worker secret of mood-read-proxy, never in the app Get it: no link in the manifest. Goes to: local, github-actions, cloudflare. Set it: `node scripts/secrets.mjs set BRAVE_SEARCH_API_KEY`.
  - PRESCORE_TOKEN: The owner's pre-scoring secret (05.10): a Worker secret of mood-read-proxy that `pnpm prescore` sends, locally and from the prescore GitHub job; never in the app Get it: no link in the manifest. Goes to: local, github-actions, cloudflare. Set it: `node scripts/secrets.mjs set PRESCORE_TOKEN`.
