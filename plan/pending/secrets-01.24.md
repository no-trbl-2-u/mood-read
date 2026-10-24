---
date: 2026-10-24
---
## Notes
- [needs-user-call] secret request 01.24: set ANTHROPIC_API_KEY in your terminal or the GUI's vault (never in a session), and 01.24 is ready again. Then delete this row.
  - ANTHROPIC_API_KEY: The scoring proxy's Claude API key (01.20, D15): a Worker secret of mood-read-proxy, never in the app Get it: https://platform.claude.com/settings/keys. Goes to: local, cloudflare. Set it: `node scripts/secrets.mjs set ANTHROPIC_API_KEY`.
