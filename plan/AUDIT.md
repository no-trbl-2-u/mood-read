# Site audit

> Latest findings from `/iterate audit`. Rewritten on each audit
> pass. `[needs-user-call]` rows are the `/oversight` queue: each
> stays until the owner answers it, and the loop continues on the
> default it names.

## Pending — [needs-user-call]

### [needs-user-call] Two cloud loops are armed on one branch
- category: ops
- logged: 2026-10-22, at adoption
- what: `.github/workflows/march.yml` (every 2 h, `NEXUS_LOOP_MODE=owner`) and `.github/workflows/next.yml` (4 a day)
  both build chunks and push `main`, under different concurrency groups (`march` and `loop`), so two ticks can race
  the same chunk. With the plan green and 02.1 ready, the next `march` tick builds 02.1 unattended, before the first
  `/next` by hand that nexus recommends (`nexus/intervention-spectrum.md`, level 0 first).
- default taken: neither workflow changed. Recommended: keep one (`march.yml`, the kit's dispatcher) and
  `gh workflow disable next`; to run 02.1 by hand first, also `gh workflow disable march` until it lands.

### [needs-user-call] AI provider and monthly spend cap for the scoring proxy
- category: product
- logged: 2026-10-22 (spec 01, Open questions 6)
- what: 01.2 needs the AI provider (the vault holds `OPENAI_API_KEY` and `BRAVE_SEARCH_API_KEY`) and the cap's amount.
- default taken: 01.2 sits in the Held lane of `plan/README.md`; 01.4 and 01.10 wait behind it. Everything else builds.

### [needs-user-call] The unpushed `chunk-01.1-player` branch
- category: plan
- logged: 2026-10-22, at adoption
- what: a local-only branch holds a first build of 01.1 (Expo SDK 58, npm, 5 commits, with a pending close that
  predates this plan's shape). It was not merged at adoption.
- default taken: spec 02 takes its scaffold (`app.json`, `tsconfig.json`, `eslint.config.js`, `assets/`) and 01.1
  takes its `src/`, both moved onto pnpm; the branch stays as it is until 01.1 lands, then can be deleted. Push it
  (`git push -u origin chunk-01.1-player`) if it should survive this machine.

### [needs-user-call] Cloudflare Pages project and token scope
- category: ops
- logged: 2026-10-22, at adoption
- what: the deploy gate targets the Pages project `mood-read` (https://mood-read.pages.dev), which does not exist yet.
  02.3 creates it with wrangler (installed on this machine) through the vault's `CLOUDFLARE_API_TOKEN`, which needs
  Cloudflare Pages: Edit. `CLOUDFLARE_*` are already in GitHub Actions secrets.
- default taken: project name `mood-read`; if the name is taken or the token lacks the scope, 02.3 stops and says so.
  `wrangler login` (or the token) is all the vault needs to push a secret `--to cloudflare` later.

### [needs-user-call] Secrets manifest entries say "imported from .env.example"
- category: ops
- logged: 2026-10-22, at adoption
- what: several `nexus.secrets.json` entries carry placeholder `for` text and `where: null`.
- default taken: left as they are (names only, already working). Fill in `for` and `where` through the GUI's Vault or
  by hand when convenient.

## Pending — findings

### [5.6] heartbeat.yml reads a secret in a job-level env
- category: ops
- impact: 4 (a secret visible to every step of the job, not just the one that needs it)
- ease: 9 (move `GITHUB_TOKEN` from `jobs.<id>.env` to the step's `env`)
- next: /iterate; `node scripts/workflow-lint.mjs` names it
