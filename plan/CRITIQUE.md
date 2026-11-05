# Critique log

> Last pass: 2026-11-05 at commit 1572637
> Pass count: 12

> External-observer feedback for Mood Read. Populated by
> `/critique`, drained by `/iterate`. See `skills/critique.md`
> for the contract.

## Pending

### [MED] every route — no Open Graph/Twitter card tags, no canonical link, no web app manifest
- pass: 12 (commit 1572637)
- viewport: n/a (web-fetch engine, no browser tools on this runner)
- category: seo
- observation: `curl`ing the raw HTML of `/` (and, by construction, every route — they share
  one root `<head>`) shows exactly four `<meta>` tags (`charset`, `X-UA-Compatible`, `viewport`,
  `description`) and one `<link>` tag (`favicon.ico`). There is no `og:title` / `og:description`
  / `og:image`, no `twitter:card`, no `<link rel="canonical">`, and no `<link rel="manifest">`
  anywhere in the shipped HTML. This is distinct from the already-fixed per-route
  title/description row (pass 1, Done): that row was about generic vs. real copy; this one is
  about entire tag families that were never added. Concretely: a link pasted into Slack,
  iMessage or Discord unfurls with no image and whatever OG fallback that platform invents, and
  the site has no PWA install metadata (no theme-color, no icons manifest) despite being a
  phone-app-first product with a web build.
- evidence: `curl -s https://mood-read.pages.dev/ | grep -io "<meta[^>]*>"` → 4 tags, no `og:`/
  `twitter:` prefix. `curl -s https://mood-read.pages.dev/ | grep -io "<link[^>]*>"` → 1 tag
  (favicon only). `curl -s -o /dev/null -w "%{content_type}" https://mood-read.pages.dev/manifest.json`
  → `text/html` (falls through to the SPA shell; no manifest file exists, no `<link
  rel="manifest">` references one either).
- suggested fix: add `og:title`, `og:description`, `og:image` (a static share image in
  `assets/`) and `twitter:card` to the root `<head>` (Expo Router's `<Head>` in the root layout,
  or `app.json`'s web config), plus a `<link rel="canonical">` per route once per-route heads
  exist. A manifest is a separate, smaller follow-up (icons + theme-color + `display:
  standalone`) if PWA install is in scope — scope that piece before picking it up.
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
- source: web-fetch

## Done

### [x] [LOW] TopBar — the shared heading has no explicit level, so some screens have no h1 (pass 10; issue #20; addressed at da9919f)

### [x] [MED] /browse/[id] — every book's page title stays the generic "Browse" (pass 10; issue #19; addressed at 808069a)

### [x] [LOW] /sitemap.xml — still falls back to the SPA shell despite being marked fixed alongside robots.txt (pass 9; issue #18; addressed at 7dde976)

### [x] [MED] /downloads vs /browse/[id] — the one-book-offline-limit warning is surfaced where it can't help (pass 7; issue #17; addressed at 8d38ba1)

### [x] [MED] /soundtrack — "Clear" deletes the whole played-pieces history with no confirmation (pass 7; issue #16; addressed at 0c5aad1)

### [x] [LOW] / — every route's static HTML shares one generic title and no description (pass 1; issue #15; addressed at 0f10efc)

### [x] [LOW] /robots.txt, /sitemap.xml — SPA catch-all serves the app shell instead of real files (pass 3; addressed at b670e89)

### [x] [LOW] no CSP, X-Frame-Options, Strict-Transport-Security or Permissions-Policy header (pass 4; addressed at bfd249b)
