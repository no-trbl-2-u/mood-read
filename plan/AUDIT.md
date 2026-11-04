# Site audit

> Latest findings from `/iterate audit`. Rewritten on each audit
> pass. `[needs-user-call]` rows are the `/oversight` queue: each
> stays until the owner answers it, and the loop continues on the
> default it names.

# Site audit — 2026-11-04 (iterate: shipped [3.2] — issue #20, commit da9919f base)

## Top 5 findings (scored)

### [3.2] TopBar — the shared heading has no explicit level, so some screens have no h1 (plan/CRITIQUE.md pass 10) [x]
- category: external-critique
- impact: 4 (LOW severity; `/browse`, `/downloads` and `/soundtrack` render
  their title through `TopBar` alone, getting an implicit h2 and no h1 at
  all, an inconsistent landmark structure for screen-reader navigation)
- ease: 8 (one `aria-level` prop on `TopBar`, defaulting to 1)
- issue: #20
- fixed: 2026-11-04 (/march, /iterate) — commit da9919f: `src/ui/TopBar.tsx`'s
  title `Text` now sets `aria-level={1}` explicitly, matching the rest of the
  app's convention of always declaring a heading's level; `e2e/a11y.spec.ts`
  gained a `topHeadings()` check asserting exactly one
  `role=heading[aria-level=1]` element across all 28 a11y states.

### [2.7] /book/[id] — the not-found screen never sets a page title (plan/CRITIQUE.md pass 7)
- category: external-critique
- impact: 3 (LOW severity; a dead or mistyped book link keeps
  whatever tab title was already showing instead of a not-found title)
- ease: 9 (two JSX lines, the same pattern [5.4] above now uses for the
  found-book branch)
- next: below the 3.0 actionable threshold alone; re-evaluate once a
  higher-scored finding lands alongside it

### [~2] /browse — the whole catalog has no crawlable path, from any entry point (plan/CRITIQUE.md pass 10)
- category: external-critique
- impact: 6 (MED severity; no sitemap entry or server-rendered link reaches
  the catalog Browse exists to showcase)
- ease: ~3 (archive.org's own `advancedsearch.php` call is public and
  needs no secret, so a script *could* fetch the popular-books list, but
  enumerating ids at commit-build time is exactly the O(content) breadth
  agents.md §3 keeps off the per-commit path — this wants a scheduled job
  writing a cached list, the same shape as 01.26's prescore job, not a
  one-line build step)
- next: too large for one `/iterate` tick as scoped; a candidate for
  `/plan-a-spec` or `/expand` rather than a quick win

### [1.2] every route's pre-hydration body is empty (plan/CRITIQUE.md pass 5)
- category: external-critique
- impact: 6
- ease: 2 (unchanged: still needs a provider-tree SSR-safety pass
  before `web.output` can flip, per plan/CRITIQUE.md's "tried" note;
  plan/CANDIDATES.md "[score 4.0] Make the root layout's providers
  SSR-safe" awaits `/oversight` promotion)
- next: no new `/iterate` action; the candidate already covers it

This tick's `/march`: triage gate cheap (0 unlabeled, 0 urgent via
`gh issue list`). Critique gate not due (3 commits / ~18h past pass 10's
base `bb95dfb`, under both the 12-commit and 24h floor). `/next top`'s
picker (`node scripts/plan/order.mjs`) again names 01.28 as the only
reachable chunk, but its `[needs-user-call]` row below is unchanged — the
mechanism shipped 2026-10-30 and the only thing left is A41's real-device
phone check, which this cloud checkout cannot perform — not re-claimed or
re-built this tick. 01.20/01.26/01.27 stay blocked on unset secrets
(`node scripts/secrets.mjs status`: still 0 of 14 set). No `data/` layer,
so step 3b doesn't apply. `/march`'s own expand gate (step 3c) falls
short too (4 commits / ~18h since pass 26's base `f67336b`, under the
20-commit/48h floor), so this tick fell to `/iterate`. With [5.4] shipped
and moved to `plan/CRITIQUE.md`'s Done section by the prior tick, [3.2]
(TopBar's missing heading level) is now the top-scored pending row,
clearing the 3.0 floor; shipped it this tick (commit da9919f).

## Pending — [needs-user-call]

### [needs-user-call] 01.28 shipped its mechanism; A41's phone check still needs a real device (A41)
- category: infra
- logged: 2026-10-30 (march, cloud tick)
- what: A41 asks for a path that ducks the bed under the narration on Android with no microphone permission,
  "checked on a phone." The mechanism shipped (commit 24068f1, on main): Android no longer tries the live,
  RECORD_AUDIO-gated tap (`expo-audio`'s `Visualizer` path; confirmed against its own Android source and the
  platform's `Visualizer` docs — there is no public, permission-free live-capture API for this in Expo SDK 58,
  and the real workaround, a custom Media3 `AudioProcessor` forked into ExoPlayer's pipeline, needs native
  Android code and on-device testing, out of scope here). Instead it reads the narration file's own loudness
  from a pre-decoded envelope (`src/lib/silence.ts`'s `levelAt`/`createEnvelopeCache`, fed by
  `src/lib/media.ts`'s `storedEnvelope`), looked up by playback position (`src/lib/timeline.ts`'s `locate`) —
  no capture API, so no permission. Same honest limit as the app's existing silence-break detection: only WAV
  decodes locally today, so a WAV-sourced book ducks for real and anything else (MP3, M4B, AAC — most real
  audiobooks) stays level, same as before, with the Mixer's note now saying so per file rather than claiming the
  whole device can't hear the narrator. 170 unit tests (`src/lib/silence.test.ts` covers the new pure logic) and
  the full e2e suite (web's own live-tap duck test, A11, still passes) are green; none of that proves the
  Android *path* actually dips a real phone's bed, since no Android device exists in this cloud checkout.
- open: whether the owner's next phone session (the same kind 01.15 and 04.1 already did for other features)
  confirms a WAV-sourced book really ducks on Android, and separately whether the WAV-only scope here is enough
  to call A41 closed or whether it should widen (the only way to widen is native code, per the dead end above).
- default taken: 01.28 is NOT closed (A41 still names a phone check this tick cannot do); its claim is released
  so a future `/next 01.28` (or the owner, directly) only needs to confirm on a device and write the close. This
  tick falls through to march's next step instead of picking another chunk.

### [needs-user-call] 01.11's playlist-save half needs infra nobody has set up (A24)
- category: product
- logged: 2026-10-27 (march, cloud tick)
- what: A24 bundles two different things. The link-out half (search links to the reference piece on Spotify,
  YouTube, YouTube Music and Apple Music, never played) needs no account and no key — buildable now. The
  playlist-save half ("a listener can save a book's reference pieces as a playlist in their own YouTube or Apple
  Music account") needs real API integration per docs/streaming-sources.md's own cost table: YouTube Data API
  playlists.insert/playlistItems.insert behind a listener OAuth sign-in, which needs a Google Cloud OAuth client
  (not secret, but a dashboard registration nobody has made yet); and Apple Music's MusicKit, which needs a
  developer token signed by a private key tied to Apple Developer Program membership — the same membership
  05.14/05.15/05.18 are already held on because the owner doesn't have one. No screen in `plan/bearings.md`
  Layout names where "save as playlist" would even live yet.
- open: whether to scope 01.11 down to the link-out half now (closing a reworded A24, and opening a new chunk +
  A-ID for YouTube's playlist-save once a Google Cloud OAuth client exists, the same placeholder pattern 01.20
  used for `scoringProxyUrl`), with Apple Music's save path held on the same gate as 05.14/05.15/05.18; or to wait
  for the owner to set up the Google Cloud OAuth client first and build the whole chunk against it.
- default taken: 01.11 stays unclaimed and off the pick list in practice; this tick picks 01.29 instead.

### [needs-user-call] 01.26 can't deploy the proxy or run prescore: OPENAI_API_KEY, BRAVE_SEARCH_API_KEY, PRESCORE_TOKEN still unset (A39)
- category: infra
- logged: 2026-10-27 (march, cloud tick); updated 2026-10-29 (march, cloud tick)
- what: 01.26's own text calls for `pnpm secrets:sync` then `wrangler deploy --config proxy/wrangler.jsonc`, then a
  `prescore.yml` workflow run with `PRESCORE_TOKEN`. The chunk line now carries an explicit `secrets` field
  (commit 99b2999) naming `CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, OPENAI_API_KEY, BRAVE_SEARCH_API_KEY,
  PRESCORE_TOKEN`, so `/next`'s picker and `node scripts/secrets.mjs request 01.26` now see the gate instead of a
  builder discovering it mid-chunk. `request` confirms `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` already
  reach this job (wrangler's own deploy credentials; `pnpm deploy:check` runs clean against them) — only
  `OPENAI_API_KEY`, `BRAVE_SEARCH_API_KEY` and `PRESCORE_TOKEN` (the Worker's own secrets) are still missing
  anywhere this loop can reach; the ask is filed in `plan/notes.md`'s Inbox.
- open: the owner sets the three in the vault and pushes them (`node scripts/secrets.mjs set NAME`, then
  `push NAME --to cloudflare` for the first two, `--to github-actions` too for `PRESCORE_TOKEN`); once set,
  `secrets.mjs request 01.26` reports nothing to ask and `/next` picks it up normally.
- default taken: 01.26 (and its dependents 01.20, 01.27) stay unclaimed and off the pick list; spec 01's only
  other candidate today is 01.28 (claimed live elsewhere) -- this tick falls through to /iterate.

## Pending — findings

### [3.6] /sitemap.xml — still falls back to the SPA shell despite being marked fixed alongside robots.txt [x]
- category: external-critique
- impact: 4 (LOW severity; the pass-3 [Z.1] fix was recorded as closing both `/robots.txt` and
  `/sitemap.xml`, but only `public/robots.txt` was ever added — a previously claimed fix silently
  half-shipped; plan/CRITIQUE.md pass 9)
- ease: 9 (one static file, the same `public/` pass-through pattern as `public/robots.txt` /
  `public/licenses.txt`, plus one e2e assertion mirroring the existing robots.txt test)
- seen: 2026-11-03 (march, cloud tick; plan/CRITIQUE.md pass 9)
- issue: #18
- fixed: 2026-11-03 (/march, /iterate) — commit 7dde976: `public/sitemap.xml` now lists the app's
  9 real static routes; `e2e/smoke.spec.ts` asserts it's served with `application/xml` and lists
  the real routes; `e2e/serve.mjs` gained an `.xml` content-type mapping (previously unmapped, so
  the hermetic e2e server would have served it as `application/octet-stream`).

### [4.2] /downloads vs /browse/[id] — the one-book-offline-limit warning is surfaced where it can't help [x]
- category: external-critique
- impact: 6 (MED severity; downloading a second book silently evicts the first's offline files, and the only explanation lives inside Downloads' empty-queue state, which a first-time listener has no reason to open before tapping Download; plan/CRITIQUE.md pass 7)
- ease: 7 (surface the note inline on Browse's download CTA, next to the existing Wi-Fi-only caption)
- seen: 2026-11-01 (march, cloud tick; plan/CRITIQUE.md pass 7)
- issue: #17
- fixed: 2026-11-01 (/march, /iterate) — commit 8d38ba1: the Browse detail screen's download button now shows the same one-book-offline limit note next to the Wi-Fi-only caption, before the listener taps Download; `e2e/browse.spec.ts` covers its visibility.

### [5.6] /soundtrack — "Clear" deletes the whole played-pieces history with no confirmation [x]
- category: external-critique
- impact: 7 (MED severity; one tap, no confirm, no undo, erases every book's played-pieces history, despite the row being styled in the danger color; plan/CRITIQUE.md pass 7)
- ease: 8 (reused `RescoreConfirm`'s inline-confirm shape, already in the app for a different destructive action)
- seen: 2026-11-01 (march, cloud tick; plan/CRITIQUE.md pass 7)
- issue: #16
- fixed: 2026-11-01 (/march, /iterate) — a Clear press now asks once (Clear or Cancel) before `soundtrack.clear()` runs, in a `soundtrack-clear-confirm` band matching `RescoreConfirm`'s shape (`src/app/soundtrack.tsx`); `e2e/soundtrack.spec.ts` covers both the Cancel (nothing clears) and Clear (clears for good) paths (commit 0c5aad1).

### [Z.2] No CSP, X-Frame-Options, HSTS or Permissions-Policy header on the web build [x]
- category: external-critique
- impact: 4 (clickjacking/HSTS/permissions hardening gap across the whole site; LOW severity per plan/CRITIQUE.md pass 4)
- ease: 8 (one Cloudflare Pages `_headers` file, the same public/ pass-through pattern as [Z.1]'s robots.txt)
- seen: 2026-10-29 (march, cloud tick; plan/CRITIQUE.md pass 4)
- issue: #14
- fixed: 2026-10-29 (/march, /iterate) — public/_headers now sets X-Frame-Options: DENY, Content-Security-Policy: frame-ancestors 'none', Strict-Transport-Security and a Permissions-Policy granting no microphone, camera or geolocation, on every route; e2e/serve.mjs parses and applies _headers so the hermetic e2e mirrors Cloudflare Pages' real behavior, and e2e/smoke.spec.ts asserts the header set (commit bfd249b).

### [Z.1] /robots.txt, /sitemap.xml served the SPA shell instead of real files [x]
- category: external-critique
- impact: 3 (crawler-facing hygiene across the whole site; LOW severity per plan/CRITIQUE.md pass 3)
- ease: 9 (one static file, the same public/ pass-through pattern as public/licenses.txt, 06.4)
- seen: 2026-10-29 (march, cloud tick; plan/CRITIQUE.md pass 3)
- issue: #13
- fixed: 2026-10-29 (/march, /iterate) - public/robots.txt (User-agent: *, Allow: /) now ships through the web export public/ pass-through, so Cloudflare Pages serves it as a real text/plain file instead of falling back to the SPA shell; e2e/smoke.spec.ts asserts the real status, content-type and body (commit b670e89).

### [5.4] The book screen's tab title never names the open book [x]
- category: a11y
- impact: 6 (the web build's tab/bookmark/shared-link title read "Mood Read" for every open book, a literal
  WCAG 2.4.2 "Page Titled" miss on the app's one genuinely dynamic, most-visited route)
- ease: 9 (book.title is already in scope at the screen's return; the fix is two JSX lines)
- seen: 2026-10-26 (/iterate, cloud march tick)
- issue: #10
- fixed: 2026-10-26 (/march, /iterate) — `src/app/book/[id].tsx` now sets `<Stack.Screen options={{ title: book.title }} />` for the native header and `<Head><title>{book.title}</title></Head>` (expo-router's Head) for the web document title, once the book loads; `e2e/player.spec.ts` asserts `page.title()` names the open book instead of the app's static default.

### [4.4] The web build keeps any number of books offline; spec 05 caps it at one [x]
- category: correctness
- impact: 4 (spec 05 Design, "The web build streams; phones keep": a browser keeps at most one book and its
  pieces and says so in Downloads; 05.4 caps playlists at one book, but book downloads and imports are not capped,
  so a browser's storage quota can evict them unannounced)
- ease: 5 (apply 05.4's one-at-a-time rule to book files on web, through 05.7's `removeDownload`)
- seen: 2026-10-25 (05.7 builder, heads-down arcturus)
- issue: #7
- fixed: 2026-10-25 (/march, /iterate) — on web, a book that lands (import, LibriVox download, "Find the file") takes
  the place of the one on the device: the other goes through `removeDownload`, so it stays on the shelf "Not on
  device" and keeps its position, bookmarks, moods, picks and mix (`booksToEvict`, `newlyOnDevice`, `enforceLimit`
  in `src/lib/book-removal.ts`, wired in `src/lib/library-manage.ts`); the Downloads web note says so. Phones: no cap.

### [4.5] Wi-Fi only gates on the setting alone: the queue never reads the network [x]
- category: correctness
- impact: 4 (with Wi-Fi only on, a phone on mobile data still downloads books and playlist pieces, since
  `onWifi` is never passed to the app's queue and defaults to true)
- ease: 5 (pass an `onWifi` from a network-status module, e.g. expo-network, in `src/lib/downloads.ts`, and
  re-run the queue when the network changes)
- seen: 2026-10-25 (05.4 builder, heads-down arcturus)
- issue: #5
- fixed: 2026-10-25 (/march, /iterate) — `src/lib/network.ts` binds expo-network; the download queue and the verdict
  sender both read `onWifi` from it and re-run when the network changes (`src/lib/network-watch.ts` holds the rules).

### [4.2] A chapter is reached (and its pieces logged) only while the book's screen is open [x]
- category: correctness
- impact: 4 (playback that runs into the next chapter while the listener is on another screen leaves that chapter
  unreached, so its emotions, its fingerprint share and its soundtrack entry wait until the book is opened again)
- ease: 6 (move `reached.reach` and the soundtrack log from `src/app/book/[id].tsx` into `PlayerProvider`)
- seen: 2026-10-24 (07.8 builder, heads-down rigel)
- issue: #8
- fixed: 2026-10-25 (/march, /iterate) - playback now reaches a chapter, moves its place and logs its pieces in
  `PlayerProvider`, decided by `recordPlayback` in `src/lib/chapter-reach.ts` (the book screen no longer does it);
  each store step is idempotent, so nothing logs twice. `e2e/soundtrack.spec.ts` rolls a chapter over from the shelf.

### [4.0] Verdicts keyed by chapter index can light on the wrong chapter after a chapter edit [x]
- category: correctness
- impact: 4 (a merge or split shifts indices, so a kept "Fits" or "Doesn't fit" can show on another chapter that
  plays the same piece; 07.5 would then send it with the wrong chapter's emotions)
- ease: 7 (clear a book's `verdicts:` in the chapter-edit path, or match the chapter title as scores do)
- seen: 2026-10-24 (07.4 builder, heads-down rigel)
- issue: #9
- fixed: 2026-10-25 (/march, /iterate) - a merge or split now moves the book's verdicts with its chapters, as it does their beds: a merge keeps the first chapter's verdicts and drops the second's, a split keeps them on the first half, and later chapters' shift with them (`verdictsAfterMerge`, `verdictsAfterSplit` in `src/lib/verdict-store.ts`, wired by `src/lib/chapter-edits.ts`). A verdict that still applies is kept, none is wiped.

### [4.5] The web export puts package assets under dist/assets/node_modules/, which Pages never uploads [x]
- category: tooling
- impact: 4 (any asset a package ships, such as expo-router's own images or a font loaded from its package, 404s on mood-read.pages.dev while it works locally and in e2e)
- ease: 5 (copy such assets into `assets/` as 06.4 did for Bricolage Grotesque, with a byte-equality test, or rename the folder after `expo export`)
- seen: 2026-10-23 (06.4: the display face, moved to assets/fonts; expo-router's assets still sit there, unrequested today)
- issue: #6
- fixed: 2026-10-25 (/march, /iterate) — `scripts/web-export-paths.mjs` runs after `expo export` (in `pnpm build` and `e2e:owner`): the 18 expo-router assets move to
  `assets/vendor/<package>/` and every reference in the bundle follows, and it fails if a node_modules path is left; `e2e/web-export.spec.ts` and the e2e guard check that none is exported or requested.

### [5.4] Two sessions' gates collide on e2e port 4173 [x]
- category: tooling
- impact: 5 (a parallel session's e2e holds 127.0.0.1:4173, so another session's `git commit` hook fails red with "is already used"; seen three times in one evening)
- ease: 6 (`playwright.config.ts` takes `E2E_PORT` and the hook or `scripts/` picks a free port per worktree)
- issue: #4
- fixed: 2026-10-25 (/iterate, cloud march tick) — `playwright.config.ts` picks a free port automatically (commit 601102b)
  (`scripts/e2e-port.mjs`: a seed derived from the worktree path, probed upward for one that's actually free)
  when `E2E_PORT` is unset, so two worktrees' gates no longer need to coordinate a port by hand.
