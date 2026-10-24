# Site audit

> Latest findings from `/iterate audit`. Rewritten on each audit
> pass. `[needs-user-call]` rows are the `/oversight` queue: each
> stays until the owner answers it, and the loop continues on the
> default it names.

## Pending — [needs-user-call]

### [needs-user-call] Read the privacy policy before a store form uses it
- category: legal
- logged: 2026-10-23 (06.6, `src/app/privacy.tsx`, live at https://mood-read.pages.dev/privacy)
- what: the loop wrote the policy from the code, claim by claim: no account, ads, analytics or crash reporting;
  books and positions stay on the device; scoring is not switched on, so nothing is sent today; when it is, only
  title, author and chapter titles; Spotify not connected. Contact is the GitHub issues page. It is not a
  lawyer's read.
- default taken: published as written; 01.2 turns off the proxy's Workers Logs so "keeps no listener data" stays
  true. Before 05.14's data-safety form, read it and change the contact line if you want an email.

### [needs-user-call] Review the 06.2 layout picks
- category: design
- logged: 2026-10-23 (06.2, `design/layouts/DECISION.md` v2, `design/layouts/v2/*.png`)
- what: five layout choices and two copy calls in the v2 boards.
- default taken: book-level actions (scoring, Build playlist) in one action band under the river's title row;
  a thin bar for a row's download progress; Build playlist progress in the band plus a mark per row; book
  management in a menu on each library row (no long-press); "Import a book" primary over "Browse free books".
  Copy: the library is titled "Your shelf"; Rescore says the current moods stay until the new ones land; the cap
  state says scoring resumes on its own (both depend on 01.2 and 01.17). Overrule any of these; it is recorded in
  DECISION.md.

### [needs-user-call] Review the 06.1 design system pick
- category: design
- logged: 2026-10-23 (06.1, `design/system/DECISION.md`, `design/system/board.png`)
- what: the board draws three "full gen z chaotic" options: A acid sticker, B zine collage, C y2k chrome.
- default taken: A, the board's recommendation (loudest with no image assets or gradient library; most contrast
  headroom). Overrule by naming B or C; the overrule is recorded in DECISION.md and 06.4 applies it.

### [needs-user-call] Two cloud loops are armed on one branch
- category: ops
- logged: 2026-10-22, at adoption
- what: `.github/workflows/march.yml` (every 2 h, `NEXUS_LOOP_MODE=owner`) and `.github/workflows/next.yml` (4 a day)
  both build chunks and push `main`, under different concurrency groups (`march` and `loop`), so two ticks can race
  the same chunk. With the plan green and 02.1 ready, the next `march` tick builds 02.1 unattended, before the first
  `/next` by hand that nexus recommends (`nexus/intervention-spectrum.md`, level 0 first).
- default taken: neither workflow changed. Recommended: keep one (`march.yml`, the kit's dispatcher) and
  `gh workflow disable next`; to run 02.1 by hand first, also `gh workflow disable march` until it lands.

### [needs-user-call] What the workarounds study asks of the owner
- category: product
- logged: 2026-10-23 (01.13, `docs/workarounds.md` section 7)
- what: (a) spec 01 and `spec.md` said Mood Read plays "converted" Audible downloads, which Audible's Conditions of
  Use (iv) forbid the listener too; (c) AIVA Pro (EUR 33 a month) or a commissioned composer for the catalog;
  (d) a Feed.fm quote for licensed mainstream music; (e) Libro.fm affiliate links in the app and Amazon Associates
  app approval.
- default taken: (a) the wording is gone and the import note points to DRM-free stores and companion mode;
  (c) decide at 01.10, starting from free CC music; (d) no, not before v1; (e) not now, plain links only. Companion
  mode is plotted after 01.7 (01.14); CC BY credits are 05.5.

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

### [needs-user-call] Install the preview APK and check it on your Android phone (04.1 A2, spec 01 A4)
- category: product
- logged: 2026-10-23 (04.1, heads-down)
- what: preview APKs are built on EAS. Open the build page on the phone and install: build 12bde103 (from 4ec32fb,
  the 04.1 commit main holds) at https://expo.dev/accounts/no.trbl.2.u/projects/mood-read/builds/12bde103-52a3-4263-b2be-8a25e22b61bc
  or, if that one failed, build 6cd8e27f at https://expo.dev/accounts/no.trbl.2.u/projects/mood-read/builds/6cd8e27f-eee9-4e49-8d63-7862ecbe44d7
  Then: import a book, play it, turn the screen off (does it keep playing?), and use the lock-screen controls
  (play, pause, 30 s back and forward). Speed should run 0.5x to 2x with the pitch kept. A newer build from main:
  `node scripts/secrets.mjs run --only EXPO_TOKEN -- pnpm build:android:preview`, or run `android-preview` in Actions.
- default taken: 04.1 lands A1 and stays open (claimed) until you report; your report closes 04.1 (A2) and 01.15
  (spec 01 A2, A4).
- owner (2026-10-23): build now, check later from this queue (option 1). Both builds finished; 12bde103 is main's 04.1 code.

## Pending — findings

### [5.5] The mini player's scrubber can't be moved from a keyboard
- category: accessibility
- impact: 5 (WCAG 2.2 2.1.1: a keyboard or switch user can't seek within a chapter; axe does not flag it, so the 06.5 gate stays green)
- ease: 6 (`src/ui/Slider.tsx`: arrow keys step 5 s, Page keys 30 s, Home and End; `aria-valuenow` already set)
- seen: 2026-10-24 (06.5)
- next: /iterate, with an e2e that focuses the scrubber and presses ArrowRight

### [4.5] The web export puts package assets under dist/assets/node_modules/, which Pages never uploads
- category: tooling
- impact: 4 (any asset a package ships, such as expo-router's own images or a font loaded from its package, 404s on mood-read.pages.dev while it works locally and in e2e)
- ease: 5 (copy such assets into `assets/` as 06.4 did for Bricolage Grotesque, with a byte-equality test, or rename the folder after `expo export`)
- seen: 2026-10-23 (06.4: the display face, moved to assets/fonts; expo-router's assets still sit there, unrequested today)
- next: /iterate, with an e2e check that no requested asset path contains node_modules

### [5.4] Two sessions' gates collide on e2e port 4173
- category: tooling
- impact: 5 (a parallel session's e2e holds 127.0.0.1:4173, so another session's `git commit` hook fails red with "is already used"; seen three times in one evening)
- ease: 6 (`playwright.config.ts` takes `E2E_PORT` and the hook or `scripts/` picks a free port per worktree)
- next: /iterate, with a test that two gates can run at once

### [5.5] settle leaves a closed chunk in a need that wraps onto a second line
- category: tooling
- impact: 5 (a done chunk still reads as a need; order and readers may hold the dependent chunk back)
- ease: 6 (scripts/plan/settle.mjs dropNeeds: match `needs <ids> ·` when the chunk line continues on the next line)
- seen: 2026-10-23, settling 01.1: 04.1 kept `needs 01.1 ·` before its wrapped `secrets EXPO_TOKEN` line, while 05's single-line needs were tidied; fixed by hand in bca090c
- seen again: 2026-10-23, settling 06.6: 05.14's single-line `needs 04.1, 06.5, 06.6 · secrets EXPO_TOKEN` kept
  06.6 (settle reported "left the needs"); fixed by hand in a116f13. The match fails whenever `secrets` follows
  `needs`, wrapped or not.
- next: /iterate, with a red-first test in scripts/__tests__

### [5.6] heartbeat.yml reads a secret in a job-level env
- category: ops
- impact: 4 (a secret visible to every step of the job, not just the one that needs it)
- ease: 9 (move `GITHUB_TOKEN` from `jobs.<id>.env` to the step's `env`)
- next: /iterate; `node scripts/workflow-lint.mjs` names it
