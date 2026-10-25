# Site audit

> Latest findings from `/iterate audit`. Rewritten on each audit
> pass. `[needs-user-call]` rows are the `/oversight` queue: each
> stays until the owner answers it, and the loop continues on the
> default it names.

## Pending — [needs-user-call]

### [needs-user-call] Redeploy the scoring proxy: own-book pre-scoring (05.22) and catalog-only pieces (05.3)
- category: production
- logged: 2026-10-25 (05.22, /heads-down capella)
- what: `pnpm prescore --from dev-audiobooks.json` is on main, and so is the proxy change that lets
  POST /v1/prescore take a book with no LibriVox number. The deployed Worker predates it, so it still answers
  such a book with 400 until `wrangler deploy --config proxy/wrangler.jsonc` runs again.
  05.3's scorer (catalog pieces only, the famous piece kept as "In the spirit of") likewise reaches listeners
  only after that deploy; until then the app re-matches each book against the live catalog on the device.
- default taken: no deploy from the loop (a production action nobody okayed for this chunk); LibriVox books
  pre-score as before. Say "deploy" to have the next loop redeploy it with 01.26's steps.

### [needs-user-call] Spotify chapter playlists and the stores stay held (05.13, 05.14, 05.15, 05.18)
- category: product
- logged: 2026-10-25 (/heads-down capella, the owner's relayed instruction to claim spec 05)
- what: 05.13 waits on Spotify's written confirmation (05.12's unclear verdict); 05.14 and 05.15 need a Play
  Store developer account and the Apple Developer Program; 05.18 waits on 05.14.
- default taken: none claimed or built; they stay in the Held lane until you lift a line.

### [needs-user-call] The app now asks librivox.org's API for a book's Gutenberg number (05.9)
- category: product
- logged: 2026-10-24 (05.9, /loop)
- what: archive.org's metadata has no Gutenberg link, so a LibriVox download makes one librivox.org API call to
  find it. 05.8 had kept the app off that API because its terms were unclear; the rights-checker now finds it
  allowed (a LibriVox post of 2026-09-16 invites third-party apps and asks for requests spaced several seconds
  apart). Unverified: whether librivox.org answers cross-site requests from the web build.
- default taken: keep the app's lookup (best effort, never fails a download); if the web build gets no number,
  those books stay web-scored. Alternative: move the lookup into the proxy, which also removes the CORS risk.

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

### [needs-user-call] Check companion mode with Audible on a real phone (01.23, spec 01 A36)
- category: product
- logged: 2026-10-24 (march, cloud tick)
- what: A36 only closes on a real iOS and Android phone: both apps play together whichever starts first, through
  a pause, a call and Bluetooth, the bed keeps playing with the screen off, and the narration's lock-screen
  controls are unchanged when companion mode is off. 01.14 built and tested the rest of A27 on web; nothing left to
  build without the phone. The same preview APK as the row above (04.1 A2) carries companion mode; no new build
  needed to check it.
- open: whether Android's background bed stops after about 3 minutes without lock-screen controls (expo-audio's
  limit when companion mode turns the narration's media session off). If it does, the owner decides between a
  foreground service with no media session and accepting the limit (noted in `docs/workarounds.md`); that decision
  waits on what the phone shows, so it is not guessed here.
- default taken: 01.23 stays unclaimed and off the loop's pick list in practice (no code to ship without the
  phone); the loop keeps working other chunks until this is checked.

### [needs-user-call] Shrink the verify gate: the kit's script tests take about 7 minutes on Windows
- category: tooling
- logged: 2026-10-24 (heads-down 07, rigel, 07.1)
- what: `pnpm test:scripts` takes about 430 s on the owner's Windows machine (the claims branch 213 s, the CLI
  127 s, settle 95 s; they spawn git), so the whole `pnpm verify` runs 8 to 12 minutes, over a 10-minute
  foreground budget, and the pre-commit hook runs it again on every commit. agents.md rule 3 says shrink the gate,
  never background it: move the kit's own script tests (`scripts/__tests__`) off the per-commit path to a nightly
  or pre-push job, keeping `proxy/src/*.test.ts` per commit.
- default taken: the gate stays whole; the loop runs it as sequential foreground legs and waits out each hook.

### [needs-user-call] agents.md rule 6 no longer lists everything the scoring proxy receives
- category: product
- logged: 2026-10-24 (heads-down 07, rigel, 07.5)
- what: rule 6 says the proxy "receives a book's title, author and chapter titles, nothing more". Since 05.9 it
  also gets a LibriVox book's public LibriVox and Gutenberg numbers, and since 07.5 the daily verdict rows
  (`{pieceId, emotions, verdict}`, no book, chapter, device or time; "Share what fits" turns them off). The rule
  book is the owner's to edit; `plan/bearings.md` and the privacy policy already say both.
- default taken: rule 6 is left as written; bearings' proxy contract and `src/app/privacy.tsx` carry the detail.

## Pending — findings

### [4.2] A chapter is reached (and its pieces logged) only while the book's screen is open
- category: correctness
- impact: 4 (playback that runs into the next chapter while the listener is on another screen leaves that chapter
  unreached, so its emotions, its fingerprint share and its soundtrack entry wait until the book is opened again)
- ease: 6 (move `reached.reach` and the soundtrack log from `src/app/book/[id].tsx` into `PlayerProvider`)
- seen: 2026-10-24 (07.8 builder, heads-down rigel)
- next: /iterate

### [4.0] Verdicts keyed by chapter index can light on the wrong chapter after a chapter edit
- category: correctness
- impact: 4 (a merge or split shifts indices, so a kept "Fits" or "Doesn't fit" can show on another chapter that
  plays the same piece; 07.5 would then send it with the wrong chapter's emotions)
- ease: 7 (clear a book's `verdicts:` in the chapter-edit path, or match the chapter title as scores do)
- seen: 2026-10-24 (07.4 builder, heads-down rigel)
- next: /iterate, before or with 07.5

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
