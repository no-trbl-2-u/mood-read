# Critique log

> Last pass: 2026-10-29 at commit 174cbe8
> Pass count: 4

> External-observer feedback for Mood Read. Populated by
> `/critique`, drained by `/iterate`. See `skills/critique.md`
> for the contract.

## Pending

### [LOW] / — every route's static HTML shares one generic title and no description
- pass: 1 (commit 715cc14)
- viewport: n/a (static HTML, pre-hydration)
- category: seo
- observation: the web export (`app.json` `web.output: "single"`) serves an
  identical static shell for every route: `<title>Mood Read</title>` and no
  `<meta name="description">`, before any client JS runs. `/`, `/import`,
  `/settings`, `/credits` and `/soundtrack` are indistinguishable at this
  layer — a share link, browser tab, or any client that doesn't execute JS
  sees the same generic title and no summary.
- evidence: `curl https://mood-read.pages.dev/` head: `<meta charset="utf-8" />`,
  `<meta name="viewport" .../>`, `<title>Mood Read</title>`, favicon link —
  no description meta; identical head across the five routes checked.
- suggested fix: add a static `<meta name="description">` to the web
  template (or `app.json` `web.meta`) summarizing Mood Read, for link
  previews and no-JS clients. Low priority — the web build is the
  development/secondary surface (phone app is primary, `plan/bearings.md`
  Stack row), not product-blocking.
- source: web-fetch

### [LOW] /book/<unknown-id>, /<unknown-route> — SPA catch-all returns 200 with no distinguishing content pre-hydration
- pass: 4 (commit 174cbe8)
- viewport: n/a (static HTML, pre-hydration)
- category: seo
- observation: a deep link to a book id that was never imported
  (`/book/does-not-exist-12345`) and a path outside the route table entirely
  (`/this-route-truly-does-not-exist`) both return HTTP 200 and the identical
  generic shell as every valid route, before any client JS runs. Once
  hydrated, the app does show proper copy for a missing book
  (`src/app/book/[id].tsx` `COPY.notFound` / `notFoundBody`: "Book not found" /
  "This book isn't on your shelf on this device."), so real users on a real
  device are fine — this only affects a crawler, a link-preview bot, or a
  stale/mistyped share link where JS never runs.
- evidence: `curl -s -o /dev/null -w "%{http_code}"` on both URLs → `200`;
  rendered body carries only the title "Mood Read", no error text, same as
  every working route.
- suggested fix: same static-shell gap as the two findings above it in this
  file (generic title/meta, SPA-served robots.txt/sitemap.xml) — once that
  work lands, extend it to give the catch-all shell a distinct
  title/meta ("Page not found — Mood Read") for unmatched routes. Low
  priority — same secondary-surface reasoning; real users already get a
  correct message post-hydration.
- source: web-fetch

## Done

### [x] [LOW] /robots.txt, /sitemap.xml — SPA catch-all serves the app shell instead of real files (pass 3; addressed at b670e89)

### [x] [LOW] no CSP, X-Frame-Options, Strict-Transport-Security or Permissions-Policy header (pass 4; addressed at bfd249b)
