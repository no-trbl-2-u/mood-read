# Critique log

> Last pass: 2026-11-13 at commit 151a4e0
> Pass count: 20

> External-observer feedback for Mood Read. Populated by
> `/critique`, drained by `/iterate`. See `skills/critique.md`
> for the contract.

## Pending

### [LOW] every route — no `<link rel="canonical">`, no web app manifest
- pass: 12 (commit 1572637); narrowed at 94a1159 (the same pass's og:/twitter: half shipped,
  moved to Done below)
- viewport: n/a (web-fetch engine, no browser tools on this runner)
- category: seo
- observation: the shared root `<head>` still has no `<link rel="canonical">` and no `<link
  rel="manifest">`. Canonical needs per-route heads first — today only `/book/[id]` and
  `/browse/[id]` set their own `<Head>` at all, and even those only override `<title>` — so a
  per-route canonical would be a second change layered on top of a per-route head rollout, not a
  one-line addition to the shared template `og:`/`twitter:` landed in. A manifest (icons,
  theme-color, `display: standalone`) is PWA-install scope nobody has asked for yet.
- evidence: `curl -s https://mood-read.pages.dev/ | grep -io "<link[^>]*>"` → 1 tag (favicon
  only, still true after 94a1159 added the `og:`/`twitter:` `<meta>` tags, which don't touch
  `<link>`). `curl -s -o /dev/null -w "%{content_type}" https://mood-read.pages.dev/manifest.json`
  → `text/html` (no manifest file).
- suggested fix: canonical — once some chunk gives every route its own `<Head>` (or the
  pre-hydration-empty-shell row below is fixed, which would need per-route heads anyway),
  add `<link rel="canonical" href="https://mood-read.pages.dev<path>">` there. Manifest — scope
  it as its own small follow-up (icons already exist in `assets/`) only if PWA install enters
  scope.
- source: web-fetch

### [LOW] /robots.txt — no Sitemap directive pointing at sitemap.xml
- pass: 12 (commit 1572637)
- viewport: n/a (web-fetch engine, no browser tools on this runner)
- category: seo
- observation: `robots.txt` is exactly `User-agent: *` / `Allow: /` — two lines, no `Sitemap:`
  line. Crawlers that don't already know the sitemap URL by convention have no robots.txt hint
  to find it.
- evidence: `curl -s https://mood-read.pages.dev/robots.txt` → `User-agent: *\nAllow: /` (no
  third line).
- suggested fix: add `Sitemap: https://mood-read.pages.dev/sitemap.xml` as a third line in the
  static `robots.txt` (or whatever generates it).
- source: web-fetch

### [LOW] /sitemap.xml — entries carry no `<lastmod>`
- pass: 12 (commit 1572637)
- viewport: n/a (web-fetch engine, no browser tools on this runner)
- category: seo
- observation: all 9 `<url>` entries in `sitemap.xml` are bare `<loc>` tags with no sibling
  `<lastmod>`, `<changefreq>`, or `<priority>`. Crawlers have no signal for how fresh each page
  is or how often to re-fetch it.
- evidence: `curl -s https://mood-read.pages.dev/sitemap.xml` → each entry is
  `<url><loc>...</loc></url>`, no other child tags.
- suggested fix: add `<lastmod>` (at minimum, the deploy date or last content-relevant commit
  date) to each entry; `<changefreq>`/`<priority>` are optional polish on top.
- source: web-fetch

### [MED] /browse — the whole catalog has no crawlable path, from any entry point
- pass: 10 (commit bb95dfb)
- viewport: n/a (web-fetch engine, no browser tools on this runner)
- category: seo
- observation: `/browse`'s book list (the default "popular on LibriVox" list and every search
  result) is populated entirely client-side from a direct archive.org fetch inside
  `src/app/browse.tsx`'s effect. Neither the server-rendered HTML nor `public/sitemap.xml`
  contains a single `/browse/<id>` link — `sitemap.xml` is a 9-entry static file covering only
  the fixed routes (`/`, `/browse`, `/import`, `/downloads`, `/soundtrack`, `/settings`,
  `/credits`, `/privacy`, `/licenses`). A crawler or no-JS client has no path at all into the
  catalog Browse exists to showcase. This is distinct from the already-filed, already-attempted
  "every route's pre-hydration body is empty" row: that one is about CSR leaving each page blank
  before JS runs; this one is about the sitemap (a static file, unaffected by CSR) never listing
  the dynamic ids in the first place, so even a fix to the CSR problem wouldn't surface the
  catalog without a separate change.
- evidence: WebFetch of `/browse` returns no links; `public/sitemap.xml` lists 9 static routes,
  no `/browse/<id>` entries.
- suggested fix: have a build-time step enumerate the pre-scored/popular book ids (the proxy's
  `GET /v1/prescored`, 05.20) and emit `/browse/<id>` entries into the sitemap, giving the
  catalog a crawlable surface independent of the CSR fix. Likely a new small build script, not a
  one-line change — scope before picking up.
- source: web-fetch

### [LOW] /book/[id] — the not-found screen never sets a page title
- pass: 7 (commit da0cb62)
- viewport: n/a (web-fetch engine, no browser tools on this runner)
- category: seo
- observation: `src/app/book/[id].tsx`'s `<Stack.Screen options={{ title: book.title
  }} />` and `<Head><title>{book.title}</title></Head>` only render in the branch
  where `book` is truthy. The early-return `!book` branch (the dead-link / unknown-id
  case) sets no title at all, so the browser tab keeps whatever title was already
  showing instead of reflecting the not-found state. This is a hydrated-state gap,
  distinct from the already-filed pre-hydration-empty-shell row below, which only
  covers the pre-JS body.
- evidence: `src/app/book/[id].tsx` lines 111-121 (the `!book` branch has no `<Head>`
  or `Stack.Screen` title override) vs lines 150-153 (title set only for a found book).
- suggested fix: set a distinct `<Head><title>Book not found — Mood Read</title></Head>`
  (and matching `Stack.Screen` title) in the `!book` branch.
- source: web-fetch

### [MED] every route (valid or not) — pre-hydration body is empty on every page, not just the catch-all
- pass: 5 (commit 359fe55); supersedes pass-4 row scoped to the catch-all only
- viewport: n/a (static HTML, pre-hydration)
- category: seo
- observation: a WebFetch-only anonymous pass (no browser tools on this
  runner) over `/`, `/import`, `/privacy`, `/settings`, `/credits` found
  every one of them serves the identical empty shell before JS runs: title
  "Mood Read", the shared meta description (pass 1's fix), an empty `<div
  id="root"></div>`, and no H1/lede/nav/body copy of any kind. This isn't
  limited to the unknown-route/unknown-book catch-all filed at pass 4 — it's
  every named route in the app, confirmed directly against raw HTML
  (`curl`), not just the reader's rendered-markdown view. `app.json`'s
  `web.output` is `"single"` (pure CSR bundle); the boilerplate HTML comment
  ("Use static rendering with Expo Router to support running without
  JavaScript") is Expo's default scaffold text and does not reflect
  reality here. Once hydrated, every route (including the not-found copy
  in `src/app/book/[id].tsx`) reads fine — this is a no-JS-client problem
  only: crawlers, link-unfurlers (Slack/iMessage/Discord previews), and
  stale/no-JS share links all see a blank "Mood Read" card for every page,
  not just a mistyped one.
- evidence: `curl -s https://mood-read.pages.dev/<path>` for all five URLs
  → identical `<body><div id="root"></div>...</body>`, no visible text
  besides the `<title>` and the shared `<meta name="description">`.
- suggested fix: Expo Router supports `web.output: "static"` (SSG — each
  route pre-rendered to its own HTML at export time), which is a config
  flip in `app.json` + `expo export` output path, not a stack change or an
  SSR server to run. That would give every route real per-page HTML
  (and could carry a per-route title/description, closing part of the
  pass-1/pass-4 gap too) without adding a server. Confirm the static
  export still satisfies `expo-router`'s dynamic `[id]` segments
  (`/book/[id]`) before flipping — may need a fallback/catch-all export
  mode for ids not known at build time.
- tried (2026-10-30, /iterate, cloud march tick, reverted — no commit): flipping
  `app.json`'s `web.output` to `"static"` and running `expo export -p web`
  does not just need the config flip. The static export renders every
  route once in a Node (no-DOM) context, and the root layout's providers
  assume a browser unconditionally: `src/lib/network.ts`'s top-level
  `export const network = createNetworkWatch({...})` calls
  `expo-network`'s `addNetworkStateListener` eagerly at module load
  (`window is not defined`; guarding it with a `typeof window !==
  "undefined"` check fixed this one) — then every route still fails
  because `PlayerProvider` (mounted in the root layout, so every page
  gets it) calls `expo-audio`'s `useAudioPlayer` unconditionally at
  render time, which reaches for the DOM's `Audio` global
  (`ReferenceError: Audio is not defined`) even on routes with no player
  UI at all (`/browse` was the one caught; the rest of the tree likely
  shares the same root cause). Making the player SSR-safe (skip or defer
  `useAudioPlayer` until mount, client-side) is a real change to
  `src/player/`'s core provider, not a config flip, and may uncover
  further browser-only assumptions once that one clears (storage,
  sqlite). Ease on this row should read low (not a cheap win) until
  someone scopes the provider-tree audit as its own chunk — recommend
  `/plan-a-spec` over another blind `/iterate` attempt.
- reconfirmed (pass 15, commit 7bc724b): a fresh anonymous WebFetch pass over
  `/`, `/browse`, `/browse/<a live archive.org identifier>`, `/import` and
  `/soundtrack` found the identical empty pre-hydration shell on every one,
  including `/browse/[id]` and the OG-tag routes whose per-route title (pass
  10) and Open Graph/Twitter tags (pass 12) are Done — confirming those fixes
  are client-side only and still never reach a non-JS client. Same root
  cause, no new fix needed beyond the one already on this row.
- reconfirmed (pass 18, commit 84fc3b1): same five-URL anonymous WebFetch pass
  (`/`, `/browse`, `/browse/allofgrace_2609_librivox`, `/import`,
  `/soundtrack`) — every raw `<title>` is the literal string "Mood Read" with
  no per-route text at all, not just the og:/twitter: meta pair called out at
  pass 15. A non-JS client, crawler, or browser tab sees the same title on
  every page, including the book detail page. Same root cause (pure CSR, no
  per-route server-rendered head); no new fix beyond the one already on this
  row.
- source: web-fetch

## Done

### [x] [HIGH] /browse — the primary catalog route 404s at its own canonical URL (pass 14; issue #23; addressed at 50c43fc)

### [x] [MED] every unmatched path — Cloudflare Pages returns HTTP 200, not a real 404 (pass 13; issue #22; addressed at f8c2170, corrected at a16c61c — see plan/AUDIT.md's Top 5 and plan/bearings.md's standing decision on `_redirects` destinations)

### [x] [MED] every route — no Open Graph/Twitter card tags (pass 12; issue #21; addressed at 94a1159)

Canonical link and the web app manifest, named in the same pass-12 row, are still open: canonical
needs per-route heads first (most routes have none yet), and the manifest is PWA-install scope
nobody has asked for — neither is a cheap-win fix, so they weren't bundled into this one.

### [x] [LOW] TopBar — the shared heading has no explicit level, so some screens have no h1 (pass 10; issue #20; addressed at da9919f)

### [x] [MED] /browse/[id] — every book's page title stays the generic "Browse" (pass 10; issue #19; addressed at 808069a)

### [x] [LOW] /sitemap.xml — still falls back to the SPA shell despite being marked fixed alongside robots.txt (pass 9; issue #18; addressed at 7dde976)

### [x] [MED] /downloads vs /browse/[id] — the one-book-offline-limit warning is surfaced where it can't help (pass 7; issue #17; addressed at 8d38ba1)

### [x] [MED] /soundtrack — "Clear" deletes the whole played-pieces history with no confirmation (pass 7; issue #16; addressed at 0c5aad1)

### [x] [LOW] / — every route's static HTML shares one generic title and no description (pass 1; issue #15; addressed at 0f10efc)

### [x] [LOW] /robots.txt, /sitemap.xml — SPA catch-all serves the app shell instead of real files (pass 3; addressed at b670e89)

### [x] [LOW] no CSP, X-Frame-Options, Strict-Transport-Security or Permissions-Policy header (pass 4; addressed at bfd249b)
