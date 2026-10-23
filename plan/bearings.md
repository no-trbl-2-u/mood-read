# Bearings — Mood Read

> Standing context for every command invocation. Read this alongside the relevant skill file (`skills/<name>.md`)
> and the matching spec. If anything here changes, update it in the same commit.

## What we're building

`spec.md` at the repo root is the one-page product spec; `plan/01-audiobook-player-app-similar-to-audible.md` is
the full v1 spec, with every owner decision so far. Read `spec.md` once at session start. The TL;DR:

> an audiobook player that scores each chapter.

Mood Read plays audiobooks the listener already owns (DRM-free files on their device) with what an Audible listener
expects, and puts a second audio layer under the narration: an ambient soundscape in v1, later a no-vocals piece
that AI chose for the chapter's mood. Listeners are people who own audiobooks and want atmosphere under them. Free,
everything local in v1, no accounts.

**The name is "Mood Read", two words, title case, in every UI string and doc. Code identifiers and slugs use
`mood-read` (packages, the Pages project) or `moodread` (the URL scheme).**

**Live at:** https://mood-read.pages.dev (the web build, for development; from chunk 02.3)

## Surface

**Surface:** `site`

A phone app (iOS and Android through Expo) with a web build; people use its screens, so it counts as `site`. The
branding capability (`/ship-asset`, `brander`) is not adopted; this line stays true for when it is.

## Auth (for Surface: site / hybrid)

**Auth:** `none`

v1 has no accounts and no sign-in (spec 01, Open questions 5): `reader` walks the web build anonymously.

## Stack (locked — do not re-litigate)

Pinned by the bootstrap (spec 02, complete; `git log --diff-filter=D -- plan/02-bootstrap.md`) from the first build
on the local branch `chunk-01.1-player`; `package.json` holds the exact versions. Take a newer patch through
`pnpm expo install`, never by hand. Revisit only if a chunk genuinely cannot ship without changing one; then stop
and log a `[needs-user-call]`.

| Layer | Choice | Why |
|---|---|---|
| Repo | One package at the repo root, beside the nexus files; no workspaces | One app; the scoring proxy (01.2) is the only other unit and can live in `proxy/` when it arrives |
| Framework | Expo SDK 58 with expo-router (routes in `src/app/`), React Native 0.88, React 19.3, react-native-web | Cross-platform phone app first, the web for development (spec 01, Open questions 1) |
| Language | TypeScript ~6.0, `strict`; the `@/*` alias maps to `./src/*` | As `chunk-01.1-player` set it |
| Audio | `expo-audio` (background playback on) | Expo's supported player; one engine, two layers (spec 01, Contracts) |
| Styling | React Native `StyleSheet` with tokens in `src/ui/theme.ts`; no CSS framework | Works on native and web alike |
| Content | none | The listener's own books; soundscape loops bundled in `assets/` (01.7) |
| Structured data | none | On-device only: `expo-sqlite` (native) and a web key-value store; no shared database. The proxy's cache is the proxy's (01.2) |
| Schemas | TypeScript types in `src/lib/types.ts` | Spec 01's Contracts name the shapes |
| Test (unit) | Node's own runner on `*.test.ts` in `src/lib/` (`node --test`, type stripping) | No Jest; pure logic tested where it lives |
| Test (e2e) | Playwright, Chromium only, over the web build on port 4173 (02.2) | The hermetic leg |
| Lint | ESLint 9 with `eslint-config-expo` (`expo lint`) | Expo's own rules |
| Pkg mgr | pnpm 12 (`packageManager` pins it), `node-linker=hoisted` in `.npmrc` | The kit's allowlist and the cloud loop's setup action assume pnpm; hoisted is the layout Metro expects |
| Hosting | Cloudflare Pages (the web build, deployed from GitHub Actions with wrangler) | The owner's choice at adoption; the scoring proxy later fits Cloudflare Workers |

**Expo moves fast.** Before writing code that touches an Expo, EAS or React Native API, read the installed `expo`
major in `package.json` and the matching versioned docs (`https://docs.expo.dev/versions/v58.0.0/`, or the index at
`https://docs.expo.dev/llms.txt`); never answer from memory. Add Expo packages with `pnpm expo install <pkg>`, never a
bare `pnpm add`, so versions match the SDK.

## External services

| # | Service | Used for | Secrets (by name, in `nexus.secrets.json`) | Status |
|---|---|---|---|---|
| 01 | GitHub | the repo, the cloud loop (`march.yml`, `next.yml`, `heartbeat.yml`), Actions secrets | `GH_TOKEN` | live |
| 02 | Cloudflare Pages | the web build's deploys (02.3), project `mood-read` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | live |
| 06 | Cloudflare Workers | the scoring proxy's home, Worker `mood-read-proxy` (`proxy/wrangler.jsonc`, 02.4); today `GET /health` only | `CLOUDFLARE_S3_ACCESS_KEY_ID`, `CLOUDFLARE_S3_SECRET_ACCESS_KEY`, `S3_API_ENDPOINT` (pushed by `pnpm secrets:sync`) | live |
| 03 | AI provider + web search | the scoring proxy's research agent (01.2) | `OPENAI_API_KEY`, `BRAVE_SEARCH_API_KEY` are in the vault; the provider is not chosen | held (spec 01, Open questions 6) |
| 04 | Expo / EAS | Android preview APKs on demand (04.1: `pnpm build:android:preview`, `android-preview.yml`) | `EXPO_TOKEN` | live: project `@no.trbl.2.u/mood-read`, keystore held by EAS |
| 05 | Sentry | error tracking, later | `SENTRY_AUTH_TOKEN` | not used in v1's specs |

No `setup/` runbooks yet: GitHub and Cloudflare are live, and the Operational notes below are Cloudflare's runbook. The first chunk that needs a
dashboard click it cannot make writes `setup/NN_<service>.md` (`nexus/customization/external-services.md`).

## Auth provider

**Auth provider:** `none, v1` (no accounts; spec 01, Open questions 5).

## AI usage map

| Surface | AI's role | Human gate | Model |
|---|---|---|---|
| A chapter's emotions (01.2) | generated from research on the book, with sources cited | a chapter with too little written about it is unscored, never guessed (A19) | not chosen (held) |
| A chapter's named piece and alternates (01.2) | suggested; every piece no-vocals (A20) | the listener's pick over `auto` (01.4) | not chosen (held) |
| The listener's audio | none: never uploaded or transcribed (spec 01, Contracts) | — | — |
| Licenses and terms | none: checked by `rights-checker` against primary sources, decided by the owner | owner | — |

## URL / API / CLI contract (locked)

Every route below is a permanent contract. Add new ones through specs; don't change existing shapes.

```
App routes (expo-router, src/app/; the same paths on the web build):
  /                 the library: every book on the device
  /book/[id]        one book's player; [id] is the Book's id
  /import           Import a book: files or a folder, and the AAX/AAXC note as a state of it (01.6)

Scripts (package.json):
  pnpm web | start                 dev server
  pnpm verify                      the full gate (pre-commit)
  pnpm deploy:check                the deploy gate (post-push)
  pnpm plan:check | settle | claims | progress | order | pulse | secrets ...   the nexus scripts

Scoring proxy (01.2): its one endpoint is pinned by 01.2 when it ships; it receives only a book's title,
author and chapter titles.
```

## Repository shape

```
mood-read/
├── spec.md                  # one-page product spec
├── README.md
├── agents.md                # the rule book (CLAUDE.md points here)
├── package.json             # pnpm; the gates and the nexus scripts
├── nexus.secrets.json       # every secret by name, never a value
├── app.json · tsconfig.json · eslint.config.js · .npmrc     # from 02.1
├── assets/                  # icons, splash, and 01.7's soundscape loops
├── src/
│   ├── app/                 # expo-router routes
│   ├── lib/                 # logic, with *.test.ts beside it
│   ├── player/              # the audio engine (01.1, 01.3)
│   └── ui/                  # small components and theme tokens
├── e2e/                     # Playwright specs + serve.mjs (02.2)
├── .claude/                 # commands, agents, settings, hooks
├── .github/                 # the cloud loop, the setup action, deploy.yml (02.3)
├── skills/                  # the loop's verbs
├── scripts/                 # the nexus scripts and the deploy gate
└── plan/                    # the plan (README.md, specs, queues, bearings)
```

## The `design/` folder

`design/layouts/` holds the layout pass (spec 03): three wireframe boards and the owner's pick,
`design/layouts/DECISION.md`, which is the layout contract below. It decides structure only; a later design
system (palette, type, motion, voice; the owner leans "gen z chaotic") replaces the visual defaults further down.
If the owner adds design exports, `design/decisions.<ext>` wins over the visual defaults. **The loop does not wait
for design.**

## Layout

Option B, chapter river, picked by the owner on 2026-10-23. `design/layouts/DECISION.md` is the full contract,
frame by frame; this is its summary. Options A and C stay in `design/layouts/` as reference only.

- **Navigation:** a two-level stack, no tab bar. Library is the root; a book opens its chapter river. Import is a
  full screen pushed from the library. Speed & Sleep and Bookmarks are the only bottom sheets, rising over a
  dimmed river from just above the mini player. The mixer and the mood card are always inline, never a sheet.
- **Mini player:** docked at the bottom of the river and of every sheet over it: cover, chapter title over a
  progress bar that scrubs, back 30 s, play/pause, forward 30 s, all in thumb reach. None in the library. It holds
  every time readout of the playing book (elapsed / length, the sleep timer's remainder); the river shows none
  (D12).
- **Library:** a list of book rows (cover, title, chapter count and state); empty, a centred "Import a book".
- **Chapter river:** the book's chapters are one scrolling list, which is also the chapter list. A reached row
  shows its title and emotion chips; the playing row expands in place to the mood card (all emotion chips, the
  named piece, alternates) and the inline mixer (balance, master, duck, layer chips); an unreached row is muted,
  locked and shows no emotions (A21); an unscored row carries an "Unscored" chip and never a guessed mood.
- **Import note (A7):** a full-screen state of Import: what the file is, why it can't open, how to bring a
  DRM-free copy, "Choose another file".
- **Lock screen:** the OS draws it; Mood Read supplies cover, titles and progress, and handles play/pause and
  30 s skips.

## Sub-agents

Defined under `.claude/agents/`. Spawn them freely: they run in parallel and keep the main agent's context clean.

| Agent | When to spawn | Returns |
|---|---|---|
| `scout` | An external fact: Expo or library docs, a file format (M4B chapters, MP3 CHAP), a vendor's API | Structured findings with citations |
| `reader` | Fresh-eyes critique of the live web build at https://mood-read.pages.dev | JSON findings array |
| `rights-checker` | Whether a soundscape, a named piece or a service may be used this way: license, terms, no vocals (01.2, 01.7, 01.9, 01.10) | One verdict block per item, with quoted evidence |

## Visual & tonal defaults

No design system yet; these hold until one lands.

- **Mode:** dark only (`userInterfaceStyle: dark`).
- **Palette:** a near-black violet ground (`#14121a`, the Android icon's background), light text, one warm accent;
  tokens in `src/ui/theme.ts`.
- **Type:** the platform's system font; large, high-contrast controls for one-handed, lock-screen-adjacent use.
- **Spacing:** a 4-point scale.
- **Voice:** calm and plain, like a good audiobook narrator: short labels, no exclamation marks, never cute.

## Plan expansion posture

- **Mode: bold** (default). `/expand` files candidates to `plan/CANDIDATES.md`; `/oversight` promotes them.

## Decisions standing for the autonomous loop

- **Library sort:** most recently played first, then title.
- **Empty library copy:** "No books yet. Add an audiobook file you own to start listening."
- **Loading state:** a quiet placeholder of the screen's shape; no spinners over playback controls.
- **Error state:** one plain sentence of what happened and what to do, with a retry where one applies.
- **Skip intervals:** 30 s back and forward; speeds 0.5× to 3× in 0.1 steps with presets 1×, 1.25×, 1.5×, 2×.
- **Accounts, sync, comments, payments:** out of scope in every v1 spec.
- **Audible:** DRM-free files only; never decrypt, never ask for an Audible password (spec 01, Open questions 2).
- **The listener's audio never leaves the device** and is never transcribed; the proxy gets title, author and
  chapter titles only.
- **Spoilers:** show a chapter's emotions only once the listener reaches it; never show events (A21).
- **Nothing plays without a license that allows it** (A18); a piece is never named if it has vocals (A20). Ask
  `rights-checker`; an `unclear` verdict means don't ship it, log it.
- **No AI or search key ships in the app** (A22).
- **Secrets by name only:** a chunk names the secrets it needs on its line; values come through
  `node scripts/secrets.mjs run`, never a terminal.

## Commit verb vocabulary (locked)

Every commit's first line is `<verb>: <subject>` (or `<verb>(<scope>): <subject>`). `.claude/hooks/guard.mjs`'s
`commit-verb` rule blocks anything else at commit time.

| Verb | Fires from |
|---|---|
| `critique` | `/critique` |
| `expand` | `/expand` |
| `jot` | `/jot` |
| `oversight` | `/oversight` |
| `triage` | `/triage` |
| `plan` | plan-state-only changes (`/plan-a-spec`, `/plot`, new specs, settles) |
| `feat` | new capability |
| `fix` | correcting a prior mistake |
| `docs` | doc-only edit |
| `chore` | tooling and config, no product change |

## Hard rules

(Mirrors `agents.md` Standing Rules. Update there first; this echoes.)

1. **Land per owner mode:** the owner's checkout (`.owner`) commits and pushes main as one act; every other checkout
   lands through pull requests.
2. **No `Co-Authored-By:` trailers, no emojis.**
3. **No `--no-verify`, no force-push, no destructive resets.**
4. **The verify gate is non-negotiable;** the deploy gate runs after every push.
5. **Tests alongside code.**
6. **Small focused components in folders.**
7. **The listener's books and data stay on the device.** Bundled audio lives in `assets/`; on-device data in
   `expo-sqlite` (native) or the web store, behind `src/lib/`.
8. **Never commit secrets.** Values live in the vault (`.env`, the keychain); `nexus.secrets.json` holds names only.
9. **Ask before the first write, or not at all;** loops take defaults and log them.

## Verify gate (hermetic, mandatory) + deploy gate

### Pre-commit: `pnpm verify`

In order (the pre-commit hook runs it):

```
plan:check → secrets:scan → typecheck → lint → test:run → test:scripts → build (expo export -p web) → e2e
```

Each leg is a hard gate. The e2e leg boots the web build on port 4173 and walks every route above with no network.

### Post-push: `pnpm deploy:check`

Polls Cloudflare Pages for the deploy whose commit hash is HEAD. Exits 0 ready, 1 error, 2 timeout, 3 config or auth.
Implementation: `scripts/deploy-check.mjs`; it reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (or `CF_*`)
and the Pages project `mood-read`.

`deploy-check.mjs` defaults to `DEPLOY_PROVIDER=cloudflare-pages` (02.3). From a checkout with no local vault file,
run it through the vault: `node scripts/secrets.mjs run --only CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID -- pnpm
deploy:check`.

**Red deploy = blocked tick.** Read the log, patch the root cause, push again. Up to 3 same-root-cause iterations;
otherwise stop per the skill's failure modes.

## Operational notes

- **Auto-deploys** (from 02.3): every push to `main` runs `deploy.yml`: `pnpm build`, then `wrangler pages deploy dist
  --project-name mood-read --branch main --commit-hash "$GITHUB_SHA"`, the hash `pnpm deploy:check` matches. Its
  `CLOUDFLARE_*` secrets come from GitHub Actions, pushed from the vault.
- **The proxy Worker** (from 02.4): `node scripts/secrets.mjs run --only CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID --
  pnpm exec wrangler deploy --config proxy/wrangler.jsonc`. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are
  wrangler's own credentials, never the Worker's secrets.
- **Two cloud workflows** run the loop today, `march.yml` and `next.yml` (see `plan/AUDIT.md`); `heartbeat.yml`
  watches them. Operator's guide: `.github/CLOUD_LOOP.md`.
- **Operational secrets** live in the vault: `node scripts/secrets.mjs status` lists every name and where it is set;
  `push NAME --to github-actions` (or `--to cloudflare`, through wrangler) sends one where it is needed.
- **Cloudflare secrets** (from 02.4): run `pnpm secrets:sync` after a `set` or a rotation; it pushes every name
  bound for `cloudflare` into the Worker `mood-read-proxy` (`--dry-run` lists them).

## Useful commands

```bash
pnpm install              # once per checkout
pnpm web                  # dev server, web (from 02.1)
pnpm verify               # the full gate
pnpm deploy:check         # post-push deploy gate
pnpm progress             # where each spec stands
node scripts/secrets.mjs status
node scripts/claims.mjs whoami
```
