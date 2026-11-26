# Site audit

> Latest findings from `/iterate audit`. Rewritten on each audit
> pass. `[needs-user-call]` rows are the `/oversight` queue: each
> stays until the owner answers it, and the loop continues on the
> default it names.

# Site audit — 2026-11-26 (iterate pass 138, base 4f0ee63: no actionable work, top score 2.7 — below the 3.0 bar; handing to expand)

## Top 5 findings (scored)

Dropped from this pass: `[user-issue #24]` (Cloud march tick crashes transiently, no retry) — issue
#24 is closed on GitHub, so it no longer qualifies as an open user-issue row. The underlying gap is
unchanged (`.github/workflows/march.yml` still carries no retry wrapper and no `workflows: write`
scope), and the live tracker for it is issue #25, still open — see the `[needs-user-call]` row
below. Don't re-derive the fix from scratch; reuse the patch already pasted into #25.

### [user-issue #27] [MED] Cloud march tick crashed at the Project toolchain step, no retry on a transient apt/DNS failure [x]
- category: external-issue
- impact: 5 (no user-facing harm, but burns a full cron slot and opens a fresh crash issue each
  occurrence)
- ease: 7 (scoped to `.github/actions/setup/action.yml`'s "Install Playwright browsers (chromium
  only)" step — `pnpm exec playwright install --with-deps chromium`'s apt-get leg hit "Temporary
  failure resolving 'azure.archive.ubuntu.com'" fetching font packages, exit 100 — wrap it in a
  retry loop on nonzero exit, no result-signature matching needed since this is a shell command,
  not the claude-code-action step)
- issue: #27
- fixed: 2026-11-12 (/march, /iterate) — commit 27fc72f: the step now retries
  `pnpm exec playwright install --with-deps chromium` up to 3 times (10s pause between attempts)
  before failing the job. Unlike #24/#25/#26, `.github/actions/setup/action.yml` sits outside
  `.github/workflows/`, so the push needed no `workflows: write` scope and landed clean from cloud.
  `pnpm verify` green (127 e2e passed, 1 skipped); `node scripts/workflow-lint.mjs` 0 problems.

### [8.1] /browse — the primary catalog route 404s at its own canonical URL (plan/CRITIQUE.md pass 14) [x]
- category: external-critique
- impact: 9 (HIGH severity; the sitemap's own canonical URL for the catalog page — the one
  `/browse/*` exists to showcase — 404s for every crawler and link-checker that follows it)
- ease: 9 (one `_redirects` line, the same exact-match-before-splat pattern every other flat
  route already uses; `e2e/serve.mjs`'s hermetic server already parses `_redirects`, from
  pass 13's fix, so no harness work was needed)
- issue: #23
- fixed: 2026-11-07 (/march, /iterate) — commit 50c43fc: added `/browse   /  200` ahead of
  `/browse/*` in `public/_redirects`; `e2e/smoke.spec.ts` gained a dedicated regression test for
  the bare path. `pnpm verify` green (127 passed).

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
job, not a one-line build step — tracked as `plan/CANDIDATES.md`'s "[score 4.0]" browse-sitemap
candidate), [1.2] every route's pre-hydration body is empty (plan/CRITIQUE.md pass 5, unchanged —
still needs the provider-tree SSR-safety pass `plan/CANDIDATES.md`'s other "[score 4.0]" candidate
already covers), [1.2] the narrowed canonical/manifest row (plan/CRITIQUE.md pass 12), and new
this tick: [1.2] `/browse/[id]` and `/book/[id]` return HTTP 200, not 404, for an unknown book id
(plan/CRITIQUE.md pass 24; impact 6, MED-SEO — a crawler or link-checker sees every bad id as a
live page; ease deliberately scored 2 — the finding's own suggested fix says a blind `_redirects`
patch can't distinguish "known route, unknown id" from "known route, real id" without catalog
awareness at the edge, and recommends waiting on either a catalog-aware Cloudflare Pages Function
or the same pre-hydration-shell SSR work already queued above, whichever lands first). From
`/critique` pass 28, rescoped at pass 33 (commit 3b91c8a, this tick's base): [1.8]
`/Browse`/`/Credits` 404 on a capitalized path instead of redirecting to the canonical lowercase
one — pass 33 confirmed this is site-wide, not an isolated pair: all eight static top-level
routes (`/Settings`, `/Soundtrack`, `/Downloads`, `/Import`, `/Privacy`, `/Licenses` alongside the
original `/Browse`/`/Credits`) 404 on their capitalized form. Severity raised LOW → MED (impact
3 → 6: a site-wide pattern any mobile-autocapitalized or title-cased link/typo can hit, on any
route, not a one-off). Ease unchanged at 3, not the usual 8-9 for a one-line `_redirects` fix,
because the finding's own suggested fix says case-insensitive matching needs a real Cloudflare
Pages Function (`functions/_middleware.ts`-shaped), not a literal line per route/case
combination — score moves 0.9 → 1.8, still below the 3.0 bar and still a single-signal finding
(one critique lineage, no corroborating independent source), so it stays here rather than
graduating to an `/expand` candidate — scope as its own small chunk if picked up directly,
same posture as the catalog-aware 404 work above. New this tick, from `/critique` pass 34
(commit 9b05d8f): [2.4] `og:url` is hardcoded to the homepage on every route (impact 3, LOW-SEO
— a link-unfurler or dedup action keying off `og:url` sends a reader to `/` instead of the
shared page; ease 8 for the stopgap of dropping the tag rather than shipping a wrong one, the
real per-route fix blocked on the same static-export work as the pre-hydration-shell row above)
— below the 3.0 bar, same posture as the other LOW SEO rows.

### History (consolidated 2026-11-17)

Passes 17-83 (2026-11-05 through 2026-11-16, ~66 ticks) held this Top 5 steady with one exception:
`/triage` queued `[user-issue #27]` (scored 3.5, above the 3.0 bar) partway through the span; that
tick's `/iterate` shipped its fix (commit 27fc72f, see the row above), and once the issue closed the
top score fell back to 2.7. Every other tick in the span found no new signal: `gh issue list` for
`triage:loop-queued`/`triage:reviewed` stayed empty throughout; issues #11/#25 held at
`triage:needs-user` the whole span (both still single-comment — one tick, base `6533389`, found
`GH_TOKEN` unset and assumed them unchanged rather than re-checking directly, confirmed unchanged
again once the token was available); no spec/design diff (`git log -p -- spec.md design/` stayed
empty); no new TODO/FIXME/XXX/HACK beyond the known ID3 `TXXX` false positive; no `workflows: write`
grant ever appeared in any workflow file; `plan/CRITIQUE.md`'s Pending rows held at 6 throughout;
`design/` stayed untouched since 2026-10-24; and `node scripts/plan/order.mjs` named only 01.28
reachable the entire span — its mechanism shipped at commit 24068f1/c145ee8 well before this span
began, and 01.20/01.26/01.27 stayed blocked on the same unset vault secrets. Every qualifying tick
handed off to `/expand` per `skills/iterate.md` §6 failure mode 6 (posture bold); those passes
(58-83, skipping only the `[user-issue #27]` tick) each filed no candidates, and the two Pending
candidates below sat unchanged throughout, still awaiting `/oversight` promotion. Per-tick detail
for passes 17-83 lived here as one paragraph each; dropped in this third consolidation per the
same `skills/iterate.md` §5 Step 1 reasoning as the prior two (2026-11-11, 2026-11-15) — the full
narrative is still in `git log -p -- plan/AUDIT.md` for anyone who needs it.

Passes 83-94 (bases `a6e156b` through `d55d640`, ~12 iterate ticks across 2026-11-16 to
2026-11-18) each reconfirmed the same fresh state with no new signal of substance, with one
addition: one tick (base `f7101d2`) found `/critique` had run in between (pass 24) and filed a
new `[MED]` row -- `/browse/[id]` and `/book/[id]` return HTTP 200, not 404, for an unknown book
id -- folded into "Also pending" above at `[1.2]` (ease deliberately low; the finding's own
suggested fix needs catalog awareness at the edge). That moved `plan/CRITIQUE.md`'s Pending
rows from 6 to 7, where it has held since. Every other check across the span stayed constant:
`gh issue list` 0 unlabeled/urgent; issues #11/#25 unchanged at `triage:needs-user` (both still
single-comment); no spec/design diff (`git log -p -- spec.md design/` empty across every base
checked); no new TODO/FIXME/XXX/HACK beyond the known false positives (ID3 `TXXX`,
`scripts/new-skill.mjs`'s scaffold TODOs); no `workflows: write` grant in any workflow file;
`plan/CANDIDATES.md`'s two Pending candidates unchanged, still awaiting `/oversight` promotion;
and `node scripts/plan/order.mjs` still naming only 01.28 reachable (same mechanism-shipped,
phone-check-pending state as every prior tick -- re-claimed and released directly on one of these
ticks, base `d55d640`, to re-check A41's phone-check gap rather than trust the note alone,
confirming nothing new beyond the `[needs-user-call]` row below). Top score held at 2.7
throughout, under the 3.0 bar; every qualifying tick handed off to `/expand` per
`skills/iterate.md` §6 failure mode 6 (posture bold), filing no candidates each time (expand
passes 83-94, commits through `d7cf2f7`). Per-tick detail for this span dropped in this fifth
consolidation, same reasoning as the prior four (2026-11-11, 2026-11-15, 2026-11-16, 2026-11-17)
-- full narrative still in `git log -p -- plan/AUDIT.md`.

Passes 95-101 (bases `d7cf2f7` through `77955dd`/`bd7add4`, ~7 iterate ticks across 2026-11-18 to
2026-11-19) each reconfirmed the same fresh state with no new signal: `gh issue list` 0
unlabeled/urgent throughout; issues #11/#25 unchanged at `triage:needs-user` (both still
single-comment); no spec/design diff (`git log -p -- spec.md design/` empty across every base
checked); no new TODO/FIXME/XXX/HACK beyond the known false positives; no `workflows: write` grant
in any workflow file; `plan/CRITIQUE.md`'s Pending rows held at 7 (one tick, base `82b91e8`, saw
`/critique` pass 26 run in between and file no findings); `plan/CANDIDATES.md`'s two Pending
candidates unchanged throughout, still awaiting `/oversight` promotion; and `node
scripts/plan/order.mjs` still naming only 01.28 reachable (same mechanism-shipped,
phone-check-pending state) — re-claimed and released directly on two of these ticks (bases
`d7cf2f7` and `7c9a0a5`) to confirm A41's phone-check gap rather than trust the note alone, every
other tick skipping the redundant reclaim since it would add nothing beyond the `[needs-user-call]`
row below. Top score held at 2.7 throughout, under the 3.0 bar; every tick handed off to `/expand`
per `skills/iterate.md` §6 failure mode 6 (posture bold), filing no candidates each time (expand
passes 95-101). Per-tick detail for this span dropped in this sixth consolidation, same reasoning
as the prior five (2026-11-11, 2026-11-15, 2026-11-16, 2026-11-17) -- full narrative still in `git
log -p -- plan/AUDIT.md`.

Passes 102-111 (bases `a489caa` through `a2b41f5`, ~10 iterate ticks across 2026-11-19 to
2026-11-21) each reconfirmed the same fresh state with no new signal of substance, with one
addition: the tick at base `a8c57d5` saw `/critique` pass 28 file one new `[LOW]` row —
`/Browse`/`/Credits` 404 on a capitalized path instead of redirecting — moving
`plan/CRITIQUE.md`'s Pending rows from 7 to 8, folded into "Also pending" above at `[0.9]`; that
didn't change the Top 5 or the 2.7 ceiling. Every other check across the span stayed constant:
`gh issue list` 0 unlabeled/urgent; issues #11/#25 unchanged at `triage:needs-user` (both still
single-comment); no spec/design diff (`git log -p -- spec.md design/` empty across every base
checked); no new TODO/FIXME/XXX/HACK beyond the known false positives; no `workflows: write`
grant in any workflow file; `plan/CANDIDATES.md`'s two Pending candidates unchanged throughout,
still awaiting `/oversight` promotion; and `node scripts/plan/order.mjs` still naming only 01.28
reachable (same mechanism-shipped, phone-check-pending state — re-claimed and released directly
on one of these ticks, base `9db79e0`, confirming `src/lib/silence.ts`/`media.ts`/`timeline.ts`
unchanged since it shipped; every other tick skipped the redundant reclaim). Both march
rate-limit gates (critique §Step 2, expand §Step 3c) stayed shut throughout the span; each tick's
expand dispatch came from `/iterate`'s own §6 failure mode 6 instead, which carries no such rate
limit. Top score held at 2.7 throughout. Per-tick detail for this span dropped in this seventh
consolidation, same reasoning as the prior six — full narrative still in `git log -p --
plan/AUDIT.md`.

Passes 112-121 (bases `925772a` through `1d30e7c`, ~10 iterate ticks across 2026-11-21 to
2026-11-22) each reconfirmed the same fresh state with no new signal of substance: `gh issue list`
0 unlabeled/urgent throughout (one tick, base `8374b08`, found `GH_TOKEN` unset and assumed
unchanged rather than re-checking directly, confirmed unchanged again once the Actions-minted
token was available the next tick); issues #11/#25 unchanged at `triage:needs-user` (both still
single-comment) across the whole span; no spec/design diff (`git log -p -- spec.md design/` empty
across every base checked); no new TODO/FIXME/XXX/HACK beyond the known `TXXX` false positive; no
`workflows: write` grant in any workflow file; `plan/CRITIQUE.md`'s Pending rows held at 8
throughout; `plan/CANDIDATES.md`'s two Pending candidates unchanged throughout, still awaiting
`/oversight` promotion; `design/` untouched; `pnpm deploy:check` green on every tick that checked
it. `node scripts/plan/order.mjs` still named only 01.28 reachable the entire span (same
mechanism-shipped, phone-check-pending state — re-claimed and released directly on two of these
ticks, bases `79d4c33` and `1d30e7c`, to re-check A41's phone-check gap rather than trust the note
alone, confirming nothing new: still no Android device, no `EXPO_TOKEN`,
`src/lib/silence.ts`/`media.ts`/`timeline.ts` unchanged since 2026-10-30). Both march rate-limit
gates (critique §Step 2, expand §Step 3c) stayed shut throughout the span; each tick's expand
dispatch came from `/iterate`'s own §6 failure mode 6 instead, which carries no such rate limit.
Top score held at 2.7 throughout (passes 112-121 filed no candidates). Per-tick detail for this
span dropped in this eighth consolidation, same reasoning as the prior seven — full narrative
still in `git log -p -- plan/AUDIT.md`.

Passes 122-131 (bases `818a66a` through `ab185f9`, ~10 iterate ticks across 2026-11-22 to
2026-11-24) each reconfirmed the same fresh state with no new signal of substance: `gh issue
list` 0 unlabeled/urgent, 0 `loop:do` throughout; issues #11/#25 unchanged (both still
single-comment, `triage:needs-user`); no spec/design diff in any window checked (`git log -p --
spec.md design/` empty); no new TODO/FIXME/XXX/HACK beyond the known `TXXX` false positive; no
`workflows: write` grant in any workflow file; `plan/CRITIQUE.md`'s Pending rows held at 8
throughout (one tick, base `2632ca7`, saw `/critique` pass 31 run in between and file no
findings; another, base `4c079c6`, saw pass 32 reconfirm the chronic pre-hydration-shell row
instead of a duplicate); `plan/CANDIDATES.md`'s two Pending candidates unchanged throughout,
still awaiting `/oversight` promotion; `pnpm deploy:check` green on every tick that checked it.
`node scripts/plan/order.mjs` still named only 01.28 reachable the entire span (same
mechanism-shipped, phone-check-pending state — re-claimed and released directly on one of these
ticks, base `5e27802`, to re-check A41's phone-check gap rather than trust the note alone,
confirming nothing new: still no Android device, no `EXPO_TOKEN`,
`src/lib/silence.ts`/`media.ts`/`timeline.ts` unchanged since 2026-10-30; one later tick, base
`ab185f9`, also confirmed 01.26/01.20/01.27 still blocked on the same unset vault secrets via
`node scripts/secrets.mjs status`). Both march rate-limit gates (critique §Step 2, expand §Step
3c) stayed shut throughout the span; each tick's expand dispatch came from `/iterate`'s own §6
failure mode 6 instead, which carries no such rate limit. Top score held at 2.7 throughout
(expand passes 122-131 filed no candidates). Per-tick detail for this span dropped in this ninth
consolidation, same reasoning as the prior eight — full narrative still in `git log -p --
plan/AUDIT.md`.

This tick (base `f72e561`, cloud march) reconfirmed the same fresh state once more: `/expand`
pass 131 ran immediately before this tick (landing as this same base commit) and filed no
candidates, so `plan/CANDIDATES.md`'s two Pending candidates stayed unchanged; `gh issue list` 0
unlabeled/urgent, 0 `loop:do`; issues #11/#25 unchanged (both still single-comment,
`triage:needs-user`); no spec/design diff since the last check (`git log -p --since="2026-11-24"
-- spec.md design/` empty); `plan/CRITIQUE.md`'s Pending rows unchanged at 8; no new
TODO/FIXME/XXX/HACK in `src/`; no `workflows: write` grant in any workflow file. `node
scripts/plan/order.mjs` still names only 01.28 reachable (same mechanism-shipped,
phone-check-pending state; not re-claimed this tick — still no Android device, no `EXPO_TOKEN` to
even build a preview APK from this cloud checkout, and
`src/lib/silence.ts`/`media.ts`/`timeline.ts` unchanged since 2026-10-30); 01.26/01.20/01.27 still
blocked on `OPENAI_API_KEY`, `BRAVE_SEARCH_API_KEY`, `PRESCORE_TOKEN` (`node scripts/secrets.mjs
status` reports all 14 declared secrets missing from this checkout's vault). `pnpm deploy:check`
green (deploy `005dbea4`, state=ready). Both march rate-limit gates stayed shut: critique (9
commits, ~16h since `382f94b`, short of 12-commit/24h) and expand (1 commit, ~2h since `b370d2e`,
short of 20-commit/48h). Top score holds at 2.7. This tick hands to `/expand` again (pass 132)
per `/iterate`'s own §6 failure mode 6, which carries no such rate limit.

Pass 133 (base `3b91c8a`, 2026-11-25) reconfirmed the same fresh state once more and, like pass
132, handed to `/expand` (pass 133, no candidates) per failure mode 6; no per-tick detail beyond
the header line was recorded. This tick (pass 134, base `f9ba232`, 2026-11-26 cloud march) found
one new signal: `/critique` pass 34 ran since (landing as this same base commit) and filed one
new `[LOW]` row — `og:url` hardcoded to the homepage on every route — folded into "Also pending"
above at `[2.4]`, moving `plan/CRITIQUE.md`'s Pending rows from 8 to 9; still below the 3.0 bar,
so the Top 5 is otherwise unchanged. Every other check held constant: `gh issue list` 0
unlabeled/urgent, 0 `loop:do`; issues #11/#25 unchanged (both still single-comment,
`triage:needs-user`); no spec/design diff since the last check (`git log -p --since="2026-11-25"
-- spec.md design/` empty); no new TODO/FIXME/XXX/HACK in `src/`; no `workflows: write` grant in
any workflow file; `plan/CANDIDATES.md`'s two Pending candidates unchanged, still awaiting
`/oversight` promotion. `node scripts/plan/order.mjs` still names only 01.28 reachable (same
mechanism-shipped, phone-check-pending state; claimed and released directly this tick to
re-check A41's phone-check gap rather than trust the note alone — confirmed nothing new: still
no Android device, no `EXPO_TOKEN`, `src/lib/silence.ts`/`media.ts`/`timeline.ts` unchanged since
2026-10-30); 01.26/01.20/01.27 still blocked on `OPENAI_API_KEY`, `BRAVE_SEARCH_API_KEY`,
`PRESCORE_TOKEN` (`node scripts/secrets.mjs status` reports all 14 declared secrets missing from
this checkout's vault). `pnpm deploy:check` green (deploy `0f7d73b8`, state=ready). Both march
rate-limit gates stayed shut: critique (1 commit, ~3.5h since `9b05d8f`, short of 12-commit/24h)
and expand (2 commits, ~8h since `234c7dd`, short of 20-commit/48h). Top score holds at 2.7. This
tick hands to `/expand` again (pass 139) per `/iterate`'s own §6 failure mode 6, which carries no
such rate limit.

Pass 135 (base `91d8b82`, 2026-11-26 cloud march) reconfirmed the same fresh state: `/expand`
pass 139 (landing as this same base commit) filed no candidates, so `plan/CANDIDATES.md`'s two
Pending rows are unchanged. Every other check held constant: `gh issue list` 0 unlabeled/urgent,
0 `loop:do`; issues #11/#25/#29 unchanged (#29 still `loop:opened`, #11/#25 still
`triage:needs-user`); no spec/design diff since the last check (`git log --oneline f9ba232..HEAD
-- spec.md design/` empty); no new TODO/FIXME/XXX/HACK in `src/`; no `workflows:` grant added to
any workflow or action file. `node scripts/plan/order.mjs` still names only 01.28 reachable (same
mechanism-shipped, phone-check-pending state — `src/lib/silence.ts`/`media.ts`/`timeline.ts`
unchanged since 2026-10-30, still no Android device, no `EXPO_TOKEN`); 01.26/01.20/01.27 still
blocked on `OPENAI_API_KEY`, `BRAVE_SEARCH_API_KEY`, `PRESCORE_TOKEN` (`node scripts/secrets.mjs
status` reports all 14 declared secrets missing from this checkout's vault). `pnpm deploy:check`
green (deploy `2300e47c`, state=ready). Both march rate-limit gates stayed shut: critique (3
commits, ~4h since `9b05d8f`, short of 12-commit/24h) and expand (1 commit, ~7min since `79f8987`,
short of 20-commit/48h). Top score holds at 2.7. This tick hands to `/expand` again (pass 140)
per `/iterate`'s own §6 failure mode 6, which carries no such rate limit.

Pass 136 (base `5336fd1`, 2026-11-26 cloud march) reconfirmed the same fresh state: `/expand`
pass 140 (landing as this same base commit) filed no candidates, so `plan/CANDIDATES.md`'s two
Pending rows are unchanged. Every other check held constant: `gh issue list` 0 unlabeled/urgent,
0 `loop:do`; issues #11/#25/#29 unchanged (#29 still `loop:opened`, #11/#25 still
`triage:needs-user`); no spec/design diff since the last check (`git log --oneline 91d8b82..HEAD
-- spec.md design/` empty); no new TODO/FIXME/XXX/HACK in `src/`; no `workflows:` grant added to
any workflow or action file; `plan/CRITIQUE.md`'s Pending rows unchanged at 9. `node
scripts/plan/order.mjs` still names only 01.28 reachable (same mechanism-shipped,
phone-check-pending state — `src/lib/silence.ts`/`media.ts`/`timeline.ts` unchanged since
2026-10-30, still no Android device, no `EXPO_TOKEN`); 01.26/01.20/01.27 still blocked on
`OPENAI_API_KEY`, `BRAVE_SEARCH_API_KEY`, `PRESCORE_TOKEN` (`node scripts/secrets.mjs status`
reports all 14 declared secrets missing from this checkout's vault). `pnpm deploy:check` green
(deploy `9993dbcc`, state=ready). Both march rate-limit gates stayed shut: critique (5 commits,
~12h since `9b05d8f`, short of 12-commit/24h) and expand (2 commits, ~6h since `f81f02b`, short
of 20-commit/48h). Top score holds at 2.7. This tick hands to `/expand` again (pass 141) per
`/iterate`'s own §6 failure mode 6, which carries no such rate limit.

Pass 137 (base `84b412d`, 2026-11-26 cloud march) reconfirmed the same fresh state: `/expand`
pass 141 (landing as this same base commit) filed no candidates, so `plan/CANDIDATES.md`'s two
Pending rows are unchanged. Every other check held constant: `gh issue list` 0 unlabeled/urgent,
0 `loop:do`; issues #11/#25/#29 unchanged (#29 still `loop:opened`, #11/#25 still
`triage:needs-user`); no spec/design diff since the last check (`git log --oneline
91d8b82..HEAD -- spec.md design/` empty); no new TODO/FIXME/XXX/HACK in `src/` (the only
`grep` hits are `TXXX` ID3 frame names in `src/lib/meta/id3.ts` and its test, a substring
false-positive on `XXX`, not a marker); no `workflows:` grant added to any workflow or action
file; `plan/CRITIQUE.md`'s Pending rows unchanged at 9. `node scripts/plan/order.mjs` still
names only 01.28 reachable (same mechanism-shipped, phone-check-pending state —
`src/lib/silence.ts`/`media.ts`/`timeline.ts` unchanged since 2026-10-30, still no Android
device, no `EXPO_TOKEN`); 01.26/01.20/01.27 still blocked on `OPENAI_API_KEY`,
`BRAVE_SEARCH_API_KEY`, `PRESCORE_TOKEN` (`node scripts/secrets.mjs status` reports all 14
declared secrets missing from this checkout's vault). `pnpm deploy:check` green (deploy
`e931e0a4`, state=ready). Both march rate-limit gates stayed shut: critique (7 commits, ~18h
since `9b05d8f`, short of 12-commit/24h) and expand (1 commit, ~6h since `f93823d`, short of
20-commit/48h). Top score holds at 2.7. This tick hands to `/expand` again (pass 142) per
`/iterate`'s own §6 failure mode 6, which carries no such rate limit.

Pass 138 (base `4f0ee63`, 2026-11-26 cloud march) reconfirmed the same fresh state: `/expand`
pass 142 (landing as this same base commit) filed no candidates, so `plan/CANDIDATES.md`'s two
Pending rows are unchanged. Every other check held constant: `gh issue list` 0 unlabeled/urgent,
0 `loop:do`; issues #11/#25/#29 unchanged (#29 still `loop:opened`, #11/#25 still
`triage:needs-user`); no spec/design diff since the last check (`git log --oneline
91d8b82..HEAD -- spec.md design/` empty); no new TODO/FIXME/XXX/HACK in `src/` (only the known
`TXXX` ID3 substring false positive); no `workflows:` grant added to any workflow or action
file; `plan/CRITIQUE.md`'s Pending rows unchanged at 9. `node scripts/plan/order.mjs` still
names only 01.28 reachable (same mechanism-shipped, phone-check-pending state —
`src/lib/silence.ts`/`media.ts`/`timeline.ts` unchanged since 2026-10-30, still no Android
device, no `EXPO_TOKEN`); 01.26/01.20/01.27 still blocked on `OPENAI_API_KEY`,
`BRAVE_SEARCH_API_KEY`, `PRESCORE_TOKEN` (`node scripts/secrets.mjs status` reports all 14
declared secrets missing from this checkout's vault). `pnpm deploy:check` green (deploy
`4e2d19eb`, state=ready). Both march rate-limit gates stayed shut: critique (9 commits, ~19.6h
since `9b05d8f`, short of 12-commit/24h) and expand (2 commits, ~7.7h since `84b412d`, short of
20-commit/48h). Top score holds at 2.7. This tick hands to `/expand` again (pass 143) per
`/iterate`'s own §6 failure mode 6, which carries no such rate limit.

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

### [needs-user-call] [user-issue #24]'s fix is built and verified but cloud can't push it: `.github/workflows/march.yml` needs `workflows` permission
- category: infra
- logged: 2026-11-08 (march, cloud tick)
- what: this tick's `/iterate` picked [user-issue #24] (score 3.0, top of the Top 5) and built the fix the
  row already named: a retry wrapper around the "Run /march (cloud mode)" step, composing the prompt once
  into `$GITHUB_ENV` so a retry sends the identical text, firing exactly once and only when the result
  message matches the exact transient signature (`is_error:true`, `num_turns:1`, `total_cost_usd:0`).
  `pnpm verify` ran fully green on it and `scripts/workflow-lint.mjs` reported 0 problems, but `git push
  origin main` was rejected: "refusing to allow a GitHub App to create or update workflow
  `.github/workflows/march.yml` without `workflows` permission". The owner job's `permissions:` block grants
  `contents: write`, `issues: write`, `id-token: write` — GitHub requires a separate `workflows: write` scope
  for any push touching a file under `.github/workflows/`, and no token available to this cloud checkout
  carries it.
- open: whether the owner adds `workflows: write` to the `owner` job's permissions (a real scope expansion
  for every future cloud tick, not just this fix), sets up an `ACTIONS_PAT` with Workflows: write (switches
  the loop to user-author mode, a bigger change), or just lands this one fix locally. The full verified patch
  is pasted in full in issue #25's body so no work is lost even though this cloud runner's local commit
  (unpushed, ephemeral) won't survive past the job.
- default taken: the fix was not shipped; issue #25 opened with the patch and the three options above. A
  future `/iterate` should not re-pick [user-issue #24] by re-deriving the same fix from scratch — reuse the
  patch in issue #25 once a path to push `.github/workflows/*` from cloud exists, or close #24 once the owner
  lands it locally. This tick ends as a no-op on `main` (see `Cloud-Run` on the run named in issue #25).
- update 2026-11-08 (march, cloud tick): a third occurrence opened issue #26 (run 42469998694), triaged closed
  as a duplicate of this row — its proximate trigger was a Bun-binary download 504 from GitHub's release CDN
  inside the claude-code-action setup (`bun: command not found`, exit 127), not #24's exact SDK init-crash
  signature, but the same underlying gap: no retry around the "Run /march (cloud mode)" step. The already-built
  fix in #25 retries on a specific result signature and may not even catch this CDN-timeout variant (the
  composite action's own setup failed before producing a result message to check); whichever unblock path the
  owner picks, confirm the retry step's condition also covers a pre-model setup failure, not just the
  SDK-erred-with-zero-cost case, before closing this row.
- update 2026-11-09 (march, cloud tick): issue #24 itself is now closed on GitHub (no code change on
  `main` explains it — `.github/workflows/march.yml`'s `permissions:` blocks still grant no
  `workflows: write` — so this was a manual close, not a shipped fix). Dropped from the regenerated
  Top 5 above since it's no longer an open user-issue row; this row (and issue #25) stay the live
  tracker for the underlying gap until the owner picks one of the three options above.

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
