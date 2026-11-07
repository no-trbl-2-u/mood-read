# Site audit

> Latest findings from `/iterate audit`. Rewritten on each audit
> pass. `[needs-user-call]` rows are the `/oversight` queue: each
> stays until the owner answers it, and the loop continues on the
> default it names.

# Site audit — 2026-11-06 (iterate: top score 4.2 — shipped, commit f8c2170 base)

## Top 5 findings (scored)

### [4.2] every unmatched path — Cloudflare Pages returns HTTP 200, not a real 404 (plan/CRITIQUE.md pass 13) [x]
- category: external-critique
- impact: 6 (MED severity; every typo'd or garbage URL indexed as a valid 200 page site-wide —
  a duplicate-content/soft-404 risk for every crawler and link-checker, not just one route)
- ease: 7 (the static files themselves — `public/_redirects`, `public/404.html` — are cheap; the
  real work was that the hermetic e2e's own static server had no `_redirects` support at all,
  so this would have shipped unverified against anything but a post-deploy curl of the live site)
- issue: #22
- fixed: 2026-11-06 (/march, /iterate) — commit f8c2170: `public/_redirects` rewrites the app's
  pretty-URL routes (`/browse/*`, `/book/*`, `/credits`, `/downloads`, `/import`, `/licenses`,
  `/privacy`, `/settings`, `/soundtrack`) at 200; `e2e/serve.mjs` now parses and honors
  `_redirects` the same way it already honors `_headers`, so `e2e/smoke.spec.ts` proves both
  halves (a known route still 200s, a garbage path gets the real 404 page) against the hermetic
  build, not only a post-deploy curl. Caught before shipping: the first pass checked redirect
  rules ahead of the "this request is the root itself" case, so a catch-all rule would have
  404'd `/` on every real deploy — fixed by matching the root to `index.html` as a literal asset
  first, ahead of any redirect rule.
  **Caught only after shipping, by curling the live deploy right after** (this is why the deploy
  gate's post-push verification matters, not just `pnpm e2e`): f8c2170's rules all rewrote to
  `/index.html`, and the catch-all used status `404`. Both are wrong on the real platform —
  Cloudflare's own clean-URL layer auto-redirects any request resolving to literally
  `/index.html` back to `/` (308), so the 200 rewrites became redirect loop-breakers, and for the
  two splat rules (`/book/*`, `/browse/*`) Cloudflare detected the resulting cycle and silently
  disabled them outright as an "infinite loop" — every dynamic book/browse deep link 404'd in
  production for roughly the few minutes between the two deploys. `404` also isn't a legal
  `_redirects` status (only 200/301/302/303/307/308 are), so the catch-all was silently ignored
  too; harmlessly, since Cloudflare Pages serves a root `404.html` automatically for anything
  unmatched regardless. Corrected at commit `a16c61c`: destinations are now `/`, the catch-all
  rule is gone, `e2e/serve.mjs` mirrors the `404.html`-fallback convention, and both `wrangler
  pages dev` (9/9 valid rules, no warnings) and a second live-site curl confirmed every route
  before moving on. Full manual `pnpm e2e` run (all 23 spec files, batched into sequential
  foreground legs) green after each commit. The lesson is now a standing decision in
  `plan/bearings.md` so it isn't relearned: verify any `_redirects` change with `wrangler pages
  dev` before pushing, never against a live curl alone.

### [4.2] every route — no Open Graph/Twitter card tags (plan/CRITIQUE.md pass 12) [x]
- category: external-critique
- impact: 6 (MED severity; the shared root `<head>` had no `og:`/`twitter:`
  metadata at all, so a link pasted into Slack, iMessage or Discord
  unfurled with no image and whatever fallback the platform invents)
- ease: 7 (the tags themselves are cheap; the real work was finding that
  `expo export` reads a local `public/index.html` as its template in
  place of its own default, since this build is pure CSR and a
  React-rendered `<Head>` never reaches a non-JS crawler)
- issue: #21
- fixed: 2026-11-05 (/march, /iterate) — commit 94a1159: `public/index.html`
  (a copy of Expo's default web template) now carries `og:type`,
  `og:site_name`, `og:title`, `og:description`, `og:image`, `og:url` and
  the matching `twitter:card`/`title`/`description`/`image`, baked into
  the static export; `og:image`/`twitter:image` point at
  `public/og-image.png` (a copy of the existing `assets/icon.png`, no new
  design asset invented). `e2e/seo-meta.spec.ts` reads the exported
  `dist/index.html` directly and asserts each tag appears exactly once.
  Canonical link and the manifest, named in the same pass-12 row, stay
  open (`plan/CRITIQUE.md`'s narrowed Pending row): canonical needs
  per-route heads first, manifest is PWA scope nobody asked for.

### [2.7] /robots.txt — no Sitemap directive pointing at sitemap.xml (plan/CRITIQUE.md pass 12)
- category: external-critique
- impact: 3 (LOW severity; crawlers that don't already know the sitemap
  URL by convention have no robots.txt hint to find it)
- ease: 9 (one line in the static `public/robots.txt`)
- next: below the 3.0 actionable threshold alone; re-evaluate once a
  higher-scored finding lands alongside it

### [2.7] /book/[id] — the not-found screen never sets a page title (plan/CRITIQUE.md pass 7)
- category: external-critique
- impact: 3 (LOW severity; a dead or mistyped book link keeps
  whatever tab title was already showing instead of a not-found title)
- ease: 9 (two JSX lines, the same pattern [5.4] below now uses for the
  found-book branch)
- next: below the 3.0 actionable threshold alone; re-evaluate once a
  higher-scored finding lands alongside it

### [2.4] /sitemap.xml — entries carry no `<lastmod>` (plan/CRITIQUE.md pass 12)
- category: external-critique
- impact: 3 (LOW severity; crawlers have no freshness signal for any of
  the 9 static routes)
- ease: 8 (one `<lastmod>` per entry, at minimum the deploy date)
- next: below the 3.0 actionable threshold alone

Also pending, tied near the bottom: [1.8] /browse has no crawlable path from any entry point
(plan/CRITIQUE.md pass 10, unchanged — no sitemap entry or server-rendered link reaches the
catalog; ease ~3, a scheduled job writing a cached id list, the same shape as 01.26's prescore
job, not a one-line build step, so it dropped out of this tick's Top 5 to make room for pass 13's
fix above), [1.2] every route's pre-hydration body is empty (plan/CRITIQUE.md pass 5, unchanged —
still needs the provider-tree SSR-safety pass `plan/CANDIDATES.md`'s "[score 4.0]" candidate
already covers) and [1.2] the narrowed canonical/manifest row (plan/CRITIQUE.md pass 12, split
off [4.2] above).

This tick's `/march`: triage gate cheap (0 unlabeled, 0 urgent via
`gh issue list`). Critique gate not due (2 commits / ~10h past pass 12's
base `1572637`, under both the 12-commit and 24h floor). `node
scripts/plan/order.mjs` still names 01.28 as the only reachable chunk;
its `[needs-user-call]` row below is unchanged — still only the owner's
phone check (A41) stands between it and closed; claimed and released
unbuilt again this tick. 01.20/01.26/01.27 stay blocked on the same
unset secrets (`node scripts/secrets.mjs status`: 0/14). No `data/`
layer, so 3b doesn't apply. `/march`'s own expand gate (3c) falls short
too (2 commits / ~10h since pass 32's base `9d9d4d5`, under the
20-commit/48h floor), so fell to `/iterate`. Unlike the prior several
ticks, this one wasn't a no-op: `plan/CRITIQUE.md`'s pass 12 (landed
earlier the same day, commit c4ae4b3) had added three new rows this
audit's stale Top 5 hadn't absorbed yet. Re-scoring them put the OG/
Twitter row at 4.2 — the first finding to clear 3.0 since [3.2] four
ticks ago — so it shipped this tick instead of handing to `/expand`.

This tick (cloud `/march`, 2026-11-05, base `cc1d887`): triage gate cheap
(0 unlabeled, 0 urgent via `gh issue list`). Critique gate not due (3
commits / ~14h past pass 12's base `1572637`, under both floors). `node
scripts/plan/order.mjs` again names only 01.28 as reachable; claimed and
released unbuilt once more — its mechanism already shipped (commit
24068f1), only the owner's phone check (A41) remains, per the
`[needs-user-call]` row below. No `data/` layer, so 3b doesn't apply.
`/march`'s own expand gate (3c) falls short (4 commits / ~14h since pass
32's base `9d9d4d5`, under the 20-commit/48h floor), so fell to
`/iterate`. The Top 5 above are unchanged from this morning's pass — the
critique pass 12 rows they already absorbed are still the freshest
signal — and the top score (2.7) stays under the 3.0 bar, so per
`skills/iterate.md` §6 failure mode 6 (posture bold) this tick handed
straight to `/expand` instead of shipping a fix. `/expand`'s pass 33
found no new candidate signal (no spec/design diff, no triage-queued
issues, no `fix:` clustering since pass 32) but reconciled
`plan/CANDIDATES.md`: the pending "OG/Twitter meta" candidate (score
3.5) is removed, its exact outcome having shipped directly as this
morning's `[4.2]` fix (commit 94a1159) rather than through `/oversight`
promotion.

This tick (cloud `/march`, 2026-11-05, base `a61e65c`): triage gate cheap
(0 unlabeled, 0 urgent via `gh issue list`). Critique gate not due (4
commits / ~16h past pass 12's base `1572637`, under both floors). `node
scripts/plan/order.mjs` again names only 01.28 as reachable; its
mechanism already shipped (commit 24068f1) and nothing new to build
without native Android code (out of scope, per the `[needs-user-call]`
row below), so it was skipped unclaimed rather than claimed and released
again. No `data/` layer, so 3b doesn't apply. `/march`'s own expand gate
(3c) falls short (1 commit / ~6h since pass 33's base `cc1d887`, under
the 20-commit/48h floor), so fell to `/iterate`. A fresh audit found the
same Top 5 as pass 33's — `git log -p cc1d887..HEAD -- spec.md design/`
empty, no new triage-queued/reviewed issues, the three `[needs-user-call]`
rows below unchanged — and the top score (2.7) stays under the 3.0 bar,
so per `skills/iterate.md` §6 failure mode 6 (posture bold) this tick
handed straight to `/expand` instead of shipping a fix. `/expand`'s
pass 34 found no new candidate signal either; see
`plan/CANDIDATES.md`'s "Considered" log for the trace.

This tick (cloud `/march`, 2026-11-05, base `aff5ae8`): triage gate cheap
(0 unlabeled, 0 urgent via `gh issue list`); one older issue (#11, the
2026-10-29 claim-release crash) is already labeled `triage:needs-user`
and routed, not new signal. Critique gate not due (5 commits / ~16h
past pass 12's base `1572637`, under both floors). `node
scripts/plan/order.mjs` again names only 01.28 as reachable; claimed
and released unbuilt once more — its mechanism is still the one that
shipped at commit 24068f1, only the owner's phone check (A41) remains,
per the `[needs-user-call]` row below. No `data/` layer, so 3b doesn't
apply. `/march`'s own expand gate (3c) falls short (1 commit / ~1h since
pass 34's base `a61e65c`, under the 20-commit/48h floor), so fell to
`/iterate`. A fresh audit found the same Top 5 as pass 34's — `git log
-p cc1d887..HEAD -- spec.md design/` empty, no new triage-queued/
reviewed issues beyond the already-routed #11, the three
`[needs-user-call]` rows below unchanged — and the top score (2.7)
stays under the 3.0 bar, so per `skills/iterate.md` §6 failure mode 6
(posture bold) this tick hands straight to `/expand` instead of
shipping a fix.

This tick (cloud `/march`, 2026-11-05, base `2341ede`): triage gate cheap
(0 unlabeled, 0 urgent via `gh issue list`); issue #11 stays labeled
`triage:needs-user`, not new signal. Critique gate not due (7 commits /
~19h40m past pass 12's base `1572637`, under both the 12-commit and 24h
floor). `node scripts/plan/order.mjs` again names only 01.28 as
reachable; skipped unclaimed rather than claimed and released again —
its mechanism is still the one that shipped at commit 24068f1, only the
owner's phone check (A41) remains, per the `[needs-user-call]` row
below. No `data/` layer, so 3b doesn't apply. `/march`'s own expand
gate (3c) falls short (2 commits / ~3h40m since pass 35's base
`aff5ae8`, under the 20-commit/48h floor), so fell to `/iterate`. A
fresh audit found the same Top 5 as pass 35's — `git log -p
cc1d887..HEAD -- spec.md design/` empty, `gh issue list` for
`triage:loop-queued`/`triage:reviewed` returns empty, `design/` has no
new or modified files, the three `[needs-user-call]` rows below
unchanged — and the top score (2.7) stays under the 3.0 bar, so per
`skills/iterate.md` §6 failure mode 6 (posture bold) this tick hands
straight to `/expand` instead of shipping a fix.

This tick (cloud `/march`, 2026-11-06, base `c2b49ce`): triage gate cheap
(0 unlabeled, 0 urgent via `gh issue list`). Critique gate not due (9
commits / ~22h past pass 12's base `1572637`, under both the 12-commit
and 24h floor). `node scripts/plan/order.mjs` again names only 01.28 as
reachable; claimed and released unbuilt once more — its mechanism is
still the one that shipped at commit 24068f1, only the owner's phone
check (A41) remains, per the `[needs-user-call]` row below. No `data/`
layer, so 3b doesn't apply. `/march`'s own expand gate (3c) falls short
(1 commit / ~2h since pass 36's base `6f4c8c2`, under the 20-commit/48h
floor), so fell to `/iterate`. A fresh audit found the same Top 5 as the
prior pass — `git log -p 2341ede..HEAD -- spec.md design/` empty, `gh
issue list` shows only the already-routed `#11` (`triage:needs-user`),
no new `triage:loop-queued`/`triage:reviewed` rows, the three
`[needs-user-call]` rows below unchanged — and the top score (2.7) stays
under the 3.0 bar, so per `skills/iterate.md` §6 failure mode 6 (posture
bold) this tick hands straight to `/expand` instead of shipping a fix.

This tick (cloud `/march`, 2026-11-06, base `4dd587f`): triage gate cheap (0 unlabeled, 0 urgent
via `gh issue list`). Critique gate not due (1 commit / ~11.5h past pass 13's base `03762de`,
under both floors). `node scripts/plan/order.mjs` again names only 01.28 as reachable, blocked on
the owner's phone check (A41, per the `[needs-user-call]` row below) — skipped unclaimed rather
than claimed and released. No `data/` layer, so 3b doesn't apply. `/march`'s own expand gate (3c)
falls short (3 commits / ~14h since pass 37's base `c2b49ce`, under the 20-commit/48h floor), so
fell to `/iterate`. Unlike the prior several ticks, this one found new signal: pass 13's own
critique landed (commit 4dd587f) after the prior audit ran, so its soft-404 row hadn't been
scored yet. Scored at 4.2, it cleared the 3.0 bar outright, so it shipped this tick (commit
`f8c2170`) instead of handing to `/expand` — see the Top 5 above for the fix, the bug caught in
review before it reached main, and a second, more serious bug caught only by curling the live
deploy right after (every dynamic route 404'd in production for a few minutes), corrected at
commit `a16c61c` and now a standing decision in `plan/bearings.md`.

This tick (cloud `/march`, 2026-11-06, base `907e8a5`): triage gate cheap (0 unlabeled, 0 urgent
via `gh issue list`). Critique gate not due (6 commits / ~21.4h past pass 13's base `03762de`,
under both the 12-commit and 24h floor). `node scripts/plan/order.mjs` again names only 01.28 as
reachable, blocked on the owner's phone check (A41, per the `[needs-user-call]` row below) —
claimed and released unbuilt once more. No `data/` layer, so 3b doesn't apply. `/march`'s own
expand gate (3c) falls short (1 commit / ~9h since pass 38's base `c959bbe`, under the
20-commit/48h floor), so fell to `/iterate`. A fresh audit found the same Top 5 as pass 38's —
`git log -p c959bbe..HEAD -- spec.md design/` empty, `gh issue list` shows only the already-routed
`#11` (`triage:needs-user`), no new `triage:loop-queued`/`triage:reviewed` rows, the three
`[needs-user-call]` rows below unchanged — and the top score (2.7) stays under the 3.0 bar, so per
`skills/iterate.md` §6 failure mode 6 (posture bold) this tick hands straight to `/expand` instead
of shipping a fix.

This tick (cloud `/march`, 2026-11-07, base `0ce8520`): triage gate cheap (0 unlabeled, 0 urgent
via `gh issue list`). Critique gate not due (8 commits / ~23.5h past pass 13's base `03762de`,
just under both the 12-commit and 24h floor). `node scripts/plan/order.mjs` again names only 01.28
as reachable, blocked on the owner's phone check (A41, per the `[needs-user-call]` row below) —
claimed and released unbuilt once more. No `data/` layer, so 3b doesn't apply. `/march`'s own
expand gate (3c) falls short (1 commit / ~2h since pass 39's base `1454727`, under the
20-commit/48h floor), so fell to `/iterate`. A fresh audit (this tick also re-ran a repo-wide
TODO/FIXME/XXX/HACK grep, finding only an ID3 `TXXX` frame-name false positive, and a fresh
colocated-test census that reconfirmed pass 35's conclusion — the large no-test `src/lib/*.ts`
list is covered at the e2e layer per `plan/bearings.md`'s test-layer split, not a gap) found the
same Top 5 as pass 39's — `git log -p 1454727..HEAD -- spec.md design/` empty, `gh issue list`
shows only the already-routed `#11` (`triage:needs-user`), no new `triage:loop-queued`/
`triage:reviewed` rows, the three `[needs-user-call]` rows below unchanged — and the top score
(2.7) stays under the 3.0 bar, so per `skills/iterate.md` §6 failure mode 6 (posture bold) this
tick hands straight to `/expand` instead of shipping a fix.

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
