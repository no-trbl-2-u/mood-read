# Site audit

> Latest findings from `/iterate audit`. Rewritten on each audit
> pass. `[needs-user-call]` rows are the `/oversight` queue: each
> stays until the owner answers it, and the loop continues on the
> default it names.

## Pending — [needs-user-call]

### [needs-user-call] After the v1 MVP: Spotify III.5, iOS and the Apple Developer Program
- category: product
- logged: 2026-10-23 (the owner's answers to the streaming study, `docs/streaming-sources.md` section 5)
- what: the owner asked to be reminded after the v1 MVP to revisit (1) Spotify Developer Policy III.5 (no
  integrating with another service's streams): ask Spotify in writing, or keep Spotify to plain links; and (2) iOS:
  the Apple Developer Program ($99 a year), which App Store builds and Apple Music playlist saving need.
- default taken: until then Spotify gets plain links only (01.11), Android preview APKs come first
  (spec 04), and nothing iOS-only is built. Answered the same day: no direct licenses from rights-holders, and
  link-outs with playlist saving plotted after 01.10.

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
