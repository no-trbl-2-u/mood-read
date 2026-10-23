# 02 — Bootstrap: the app shell and its gates

> Mood Read boots as an Expo app at the repo root on pnpm, its verify gate runs typecheck, lint, unit tests, the web
> build and a hermetic e2e, and every push to `main` deploys the web build to https://mood-read.pages.dev with a deploy
> gate that reports the result.

Agent-facing spec. Every judgment call is made below; a build that meets a new one decides it and records it in the
commit body. Spec 01 (the product) builds on this one: its first chunk, 01.1, needs 02.2.

## Why

Verified 2026-10-22: main holds the plan, the nexus overlay and a root `package.json` whose `pnpm verify` runs only the
plan gate, the secrets scan and the nexus scripts' own suites. There is no app on main. A first build of the player
sits on the local branch `chunk-01.1-player` (Expo SDK 58, npm, never pushed); it is the source this spec's scaffold
starts from. Every later chunk assumes an app that builds, tests, deploys and reports, so this spec makes that true
first. It was added at adoption, after spec 01, so it is numbered 02 and runs at priority 1.

## Design

- **Stack pins** (from `chunk-01.1-player`'s `package.json`; take a newer patch through `pnpm expo install`, never by
  hand): `expo` ~58.0.17, `expo-router` ~58.0.25, `react` 19.3.0, `react-dom` 19.3.0, `react-native` 0.88.0,
  `react-native-web` ^0.21.4, `react-native-safe-area-context` ~5.10.1, `react-native-screens` ~4.30.0,
  `expo-status-bar`, `expo-constants`, `expo-linking`; dev: `typescript` ~6.0.3, `eslint` ^9 with `eslint-config-expo`
  ~58.0.4, `@playwright/test` (02.2). Audio, file and storage packages (`expo-audio`, `expo-document-picker`,
  `expo-file-system`, `expo-sqlite`) arrive with the chunk that uses them (01.1), not here.
- **One package at the repo root.** No workspaces: `package.json`, `app.json`, `tsconfig.json`, `eslint.config.js`,
  `assets/` and `src/` sit at the root beside the nexus files. Routes live in `src/app/` (expo-router), logic in
  `src/lib/`, UI pieces in `src/ui/`. The `@/*` path alias maps to `./src/*`.
- **Where 02.1 starts.** Take `app.json`, `tsconfig.json`, `eslint.config.js` and `assets/` from `chunk-01.1-player`
  as they are (`git show chunk-01.1-player:<path>`). Its `package.json` dependency set seeds the pins above; the
  scripts are this spec's. Drop its `package-lock.json` (pnpm owns the lockfile) and its `AGENTS.md` (on Windows it
  is the same file as `agents.md`, the rule book; its Expo guidance is already in `bearings.md`). Its `src/` is
  01.1's, not this spec's: 02.1 ships a shell with the two routes below, each a placeholder screen.
- **pnpm and Expo.** Add `.npmrc` with `node-linker=hoisted`, the layout Expo's Metro bundler expects from pnpm.
  Install Expo packages with `pnpm expo install <pkg>` so versions match the SDK.
- **Unit tests.** Pure logic in `src/lib/` is tested with Node's own runner on TypeScript files (`node --test`, Node 22+
  strips types), as `chunk-01.1-player` does. No Jest. UI is covered by the e2e leg, not unit tests.
- **The verify gate.** `pnpm verify` runs, in order: `plan:check` → `secrets:scan` → `typecheck` (`tsc --noEmit`) →
  `lint` (`expo lint`) → `test:run` (the app's unit tests) → `test:scripts` (the nexus scripts' suites) → `build`
  (`expo export -p web`, into `dist/`) → `e2e` (from 02.2). Each leg is hard.
- **The hermetic e2e (02.2).** Playwright, Chromium only, `playwright.config.ts` at the root, specs in `e2e/`. Its
  `webServer` runs `node e2e/serve.mjs` on port 4173: a small static server over `dist/` with a single-page fallback
  to `index.html`, no dependency. No network beyond localhost. The smoke walk loads every route in the contract,
  asserts the screen's title renders, and fails on any console error or failed request.
- **Deploy (02.3).** `.github/workflows/deploy.yml` on push to `main`: `./.github/actions/setup`, `pnpm build`, then
  `pnpm exec wrangler pages deploy dist --project-name mood-read --branch main --commit-hash "$GITHUB_SHA"`
  (`wrangler` a dev dependency). The commit hash is what `pnpm deploy:check` matches. The workflow reads
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from GitHub Actions secrets, pushed from the vault with
  `node scripts/secrets.mjs push <NAME> --to github-actions`. Create the Pages project once with
  `wrangler pages project create mood-read --production-branch main` (through
  `node scripts/secrets.mjs run --only CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID -- ...`), then flip
  `scripts/deploy-check.mjs`'s default provider from `none` to `cloudflare-pages`. The first deploy may be red;
  iterate within 02.3, three same-root-cause misses is a stop.
- **Web output.** `app.json`'s `expo.web.output` is `single` (one `index.html`, client routing); Cloudflare Pages
  serves it as a single-page app.

Decisions made upfront (do not ask):

- Dark only (`userInterfaceStyle: dark`), as `chunk-01.1-player` set it.
- iOS bundle id and Android package `com.moodread.app`; URL scheme `moodread`.
- No EAS builds in this spec: native builds are a later spec's call. The web build is the deploy target.
- `README.md` gets a short "Develop" section (`pnpm install`, `pnpm web`, `pnpm verify`).

- **Cloudflare secrets sync (02.4).** The vault already pushes one name at a time to a Worker
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
    The R2 / S3 credentials (`CLOUDFLARE_S3_ACCESS_KEY_ID`, `CLOUDFLARE_S3_SECRET_ACCESS_KEY`, `S3_API_ENDPOINT`)
    keep `cloudflare` and are pushed to the Worker, as the owner set them (owner, 2026-10-23); 01.2 revisits them
    when it decides the proxy's storage, since a Worker usually reaches R2 through a binding, not keys.
  - **Docs.** `plan/bearings.md`'s Operational notes and `agents.md`'s Operational secrets gain one line each:
    `pnpm secrets:sync` after a `set` or a rotation.

## Contracts

- **Scripts:** `pnpm web` (dev server, web), `pnpm start`, `pnpm typecheck`, `pnpm lint`, `pnpm test:run`,
  `pnpm build`, `pnpm e2e`, `pnpm verify`, `pnpm deploy:check`; the nexus scripts already in `package.json` stay.
- **Routes:** `/` (the library), `/book/[id]` (a book's player). The full list lives in `bearings.md`.
- **Deploy gate exits:** 0 ready, 1 error, 2 timeout, 3 config or auth.

## Acceptance

- **A3** A push to `main` deploys the web build to Cloudflare Pages, and `pnpm deploy:check` exits 0 against
  https://mood-read.pages.dev for that commit.
- **A4** The Worker `mood-read-proxy` exists on the Cloudflare account, configured in
  `proxy/wrangler.jsonc`, and answers `GET /health` with 200, so a Cloudflare push has a target before 01.2.
- **A5** `pnpm secrets:sync` pushes every name the manifest sends to `cloudflare` into `mood-read-proxy`,
  one audit line each and no value printed; `--dry-run` only lists them; a name missing from the vault stops it
  before any push, naming what to set.

## Open questions

(None. The R2 / S3 question is answered in Design, under 02.4's manifest.)

## Chunks
Measure: 3 open · 2 closed · next A6

- [ ] **02.3** Cloudflare Pages deploy from Actions and a green deploy gate · M · closes A3 · needs — ·
  secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
  - Iterate within this chunk until `pnpm deploy:check` is green; a red first deploy is expected.
- [ ] **02.4** One command syncs the vault's Cloudflare secrets to the proxy Worker · S ·
  closes A4, A5 · needs 02.3 · secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
  - Reuse `scripts/secrets-sinks.mjs`'s `cloudflare` sink and `wrangler` as 02.3 pins it; add no second path to a
    value.
