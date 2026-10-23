---
date: 2026-10-22
---
## Add plan/02-bootstrap.md
~~~ section Design
- **Cloudflare secrets sync (02.?sync).** The vault already pushes one name at a time to a Worker
  (`node scripts/secrets.mjs push NAME --to cloudflare --worker W`, through `wrangler secret put`, the value on
  stdin) and records each push in `.nexus/secrets-audit.jsonl`. Missing today: a Worker to push to, and one command
  for every name. So:
  - **The target.** The Worker `mood-read-proxy`, configured in `proxy/wrangler.jsonc` with `proxy/src/index.ts`
    answering `GET /health` with `200 ok` and nothing else, deployed once with `wrangler deploy` (through
    `node scripts/secrets.mjs run --only CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID -- ...`). It is the scoring
    proxy's home: 01.2 builds the real proxy on this Worker, its secrets already in place.
  - **The command.** `pnpm secrets:sync` runs `scripts/secrets-sync.mjs`. For every name in `nexus.secrets.json`
    whose `destinations` include `cloudflare`, it runs the existing sink (`secrets.mjs push NAME --to cloudflare
    --worker mood-read-proxy`), in manifest order, printing one line per name (`pushed` or why not), never a
    value. A name not set in the vault stops the run before any push, naming what to `set`. `--dry-run` lists the
    names and pushes nothing. Owner mode only, as every sink is. Tests run it through a recording runner, never
    wrangler.
  - **The manifest.** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are wrangler's own credentials, not the
    Worker's: drop `cloudflare` from their `destinations` (they keep `local` and `github-actions`). Every other
    entry keeps the destinations the owner set.
  - **Docs.** `plan/bearings.md`'s Operational notes and `agents.md`'s Operational secrets gain one line each:
    `pnpm secrets:sync` after a `set` or a rotation.
~~~
~~~ acceptance
- **A?sync-target** The Worker `mood-read-proxy` exists on the Cloudflare account, configured in
  `proxy/wrangler.jsonc`, and answers `GET /health` with 200, so a Cloudflare push has a target before 01.2.
- **A?sync-cmd** `pnpm secrets:sync` pushes every name the manifest sends to `cloudflare` into `mood-read-proxy`,
  one audit line each and no value printed; `--dry-run` only lists them; a name missing from the vault stops it
  before any push, naming what to set.
~~~
~~~ questions
- Should the R2 / S3 credentials (`CLOUDFLARE_S3_ACCESS_KEY_ID`, `CLOUDFLARE_S3_SECRET_ACCESS_KEY`,
  `S3_API_ENDPOINT`) be Worker secrets at all? A Worker usually reaches R2 through a binding, not keys. Default:
  keep them as the owner set them (pushed), and revisit when 01.2 decides the proxy's storage.
~~~
~~~ chunks
- [ ] **02.?sync** One command syncs the vault's Cloudflare secrets to the proxy Worker · S ·
  closes A?sync-target, A?sync-cmd · needs 02.3 · secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
  - Reuse `scripts/secrets-sinks.mjs`'s `cloudflare` sink and `wrangler` as 02.3 pins it; add no second path to a
    value.
~~~
