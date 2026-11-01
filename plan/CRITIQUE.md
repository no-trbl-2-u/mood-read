# Critique log

> Last pass: 2026-11-01 at commit da0cb62
> Pass count: 7

> External-observer feedback for Mood Read. Populated by
> `/critique`, drained by `/iterate`. See `skills/critique.md`
> for the contract.

## Pending

### [MED] /soundtrack — "Clear" deletes the whole played-pieces history with no confirmation
- pass: 7 (commit da0cb62)
- viewport: n/a (web-fetch engine, no browser tools on this runner)
- category: comprehension
- observation: the soundtrack screen's clear action is a single `Pressable` that calls
  `soundtrack.clear()` directly on press — no confirm dialog, no undo, no secondary
  step — despite being styled in the danger color and permanently erasing the
  listener's whole played-pieces history across every book.
- evidence: `src/app/soundtrack.tsx` lines 62-71 — `<Pressable testID="soundtrack-clear"
  role="button" aria-label={COPY.clear} onPress={() => soundtrack.clear()}
  style={styles.clear}>` with no intervening confirm state.
- suggested fix: add a confirmation step before `soundtrack.clear()` runs, matching
  the `RescoreConfirm` pattern already used elsewhere in the app for destructive
  actions (`src/player/ScoringBand.tsx`, wired into `src/app/book/[id].tsx`).
- source: web-fetch

### [MED] /downloads vs /browse/[id] — the one-book-offline-limit warning is surfaced where it can't help
- pass: 7 (commit da0cb62)
- viewport: n/a (web-fetch engine, no browser tools on this runner)
- category: comprehension
- observation: on the web, downloading a second book silently evicts the first book's
  offline files (it stays on the shelf, just no longer available offline). That
  behavior is explained in `downloads.tsx`'s copy, but only inside the empty-queue
  state, which a first-time listener has no reason to open before tapping Download.
  The actual Download button, on the book's Browse detail screen, carries no such
  warning — only a Wi-Fi-only caption.
- evidence: `src/app/downloads.tsx` lines 95-107 (`EmptyQueue`, `COPY.webNote` only
  rendered when `downloads.length === 0`) vs `src/app/browse/[id].tsx` lines 196-201
  (the download CTA shows only `COPY.wifiCaption`, no eviction note).
- suggested fix: surface the one-book-offline-limit note inline on the Browse detail
  screen's download button (or as a brief confirm) before a second download evicts
  the first, not only buried in Downloads' empty state.
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

### [x] [LOW] / — every route's static HTML shares one generic title and no description (pass 1; issue #15; addressed at 0f10efc)

### [x] [LOW] /robots.txt, /sitemap.xml — SPA catch-all serves the app shell instead of real files (pass 3; addressed at b670e89)

### [x] [LOW] no CSP, X-Frame-Options, Strict-Transport-Security or Permissions-Policy header (pass 4; addressed at bfd249b)
