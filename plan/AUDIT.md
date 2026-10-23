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

### [needs-user-call] SoundCloud tracks in the royalty-free catalog
- category: product
- logged: 2026-10-23 (01.12, `docs/streaming-sources.md` section 5, items e and f)
- what: (e) use hand-picked CC-BY / CC-BY-SA SoundCloud tracks in the royalty-free catalog; (f) whether a free app
  with no ads counts as "non-commercial" for CC-NC tracks (the CC FAQ leaves it open, and it flips the day the app
  earns money).
- default taken: (e) yes, as candidates the rights-checker clears track by track when 01.10 builds the catalog;
  (f) no, NC tracks stay out. Neither blocks a chunk before 01.10.

### [needs-user-call] After the v1 MVP: Spotify III.5, iOS and the Apple Developer Program
- category: product
- logged: 2026-10-23 (the owner's answers to the streaming study, `docs/streaming-sources.md` section 5)
- what: the owner asked to be reminded after the v1 MVP to revisit (1) Spotify Developer Policy III.5 (no
  integrating with another service's streams): ask Spotify in writing, or keep Spotify to plain links; and (2) iOS:
  the Apple Developer Program ($99 a year), which App Store builds and Apple Music playlist saving need.
- default taken: until then Spotify gets plain links only (01.11), Android preview APKs come first
  (spec 04), and nothing iOS-only is built. Answered the same day: no direct licenses from rights-holders, and
  link-outs with playlist saving plotted after 01.10.

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
