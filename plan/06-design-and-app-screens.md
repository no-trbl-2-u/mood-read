# 06 · Design system, the screens v1 and v2 leave undrawn, Settings, accessibility and a privacy policy

> Mood Read gets its look (palette, type, icons, motion, voice), a layout for every screen the chapter-river
> decision left out (Browse, a LibriVox book, Downloads, Credits, Settings, the library's menu and row states,
> "Build playlist", scoring states, first run), a Settings screen, an accessibility pass, and a privacy policy,
> all before v2 builds on them.

Agent-facing spec. Every judgment call is made below; a build that meets a new one decides it and records it in the
commit body.

## Why

From the owner (2026-10-23), after a gap review of what ships before v2: "Plot all of the gaps you found ... with
your defaults." Verified 2026-10-23: `design/layouts/DECISION.md` draws only v1's screens (library, river, mini
player, the two sheets, import and its AAX/AAXC note) and leaves "Palette, type, iconography, motion and voice"
to "the later design system spec", which no spec held. Spec 05 adds Browse, a book page, Downloads, Credits, an
overflow menu, new library row states and a "Build playlist" button with no frame for any of them. Wi-Fi-only
downloads (05.6), companion mode (01.14) and Spotify connect (05.13) need a Settings screen nobody plans. Scoring
(01.2) runs in the background with no drawn way to start it, follow it, or see that the monthly cap has paused it.
Nothing plans accessibility, and Spotify connect and both stores require a privacy policy.

## Design

- **The design system (06.1).** One decision file, `design/system/DECISION.md`, with a board
  (`design/system/board.html`, screenshotted to PNG as spec 03's boards were): dark palette as tokens (surface,
  raised, text, muted, accent, emotion hues for the fixed emotion set, focus ring), a type scale, spacing, radius,
  iconography (one open-licensed icon set, checked by the `rights-checker`), motion (the crossfade and row-expand
  timings) and voice (tone of every UI string, the "Unscored" and cap copy). Tokens land in `src/ui/theme.ts`, the
  only place a colour or size lives. Dark only stays (spec 02's decision). `plan/bearings.md`'s visual defaults
  give way to it.
- **The v2 layout pass (06.2).** Boards in `design/layouts/v2/`, recorded as additions to
  `design/layouts/DECISION.md` in option B's grammar (two-level stack, no tab bar, inline over sheets):
  - **Library:** the top bar's overflow menu (Browse, Downloads, Settings, Credits); row states ("Not on device",
    downloading with progress, "Scored", "Scoring 40%", "Finished"); the empty state offering "Browse free books"
    beside "Import a book".
  - **Browse** (`/browse`): search field, results list, mood chips on pre-scored rows; **a LibriVox book**
    (`/browse/[id]`): cover, readers, length, chapters, its overall emotions when scored, "Download".
  - **Downloads** (`/downloads`): the queue with pause, resume and retry, and the storage meter.
  - **Credits** (`/credits`) and **Settings** (`/settings`), both from the overflow menu.
  - **Scoring in the river:** "Score this book" in the river's top bar on an unscored book; progress while it runs;
    "Waiting: this month's scoring budget is spent" when the cap stops it; "Rescore" in the overflow, explicit (A13).
  - **"Build playlist"** in the river's top bar on a scored book, its progress, and a downloaded mark per row.
  - **First run:** one dismissible line on first scoring: "Only the title, author and chapter titles are sent."
- **Settings (06.3).** A plain list: Downloads on Wi-Fi only (default on, used by 05.6), Companion mode (01.14's
  switch), Default soundscape, Storage (links to Downloads), Connected accounts (Spotify, from 05.13), and links to
  Credits and the privacy policy. Each setting saves on the device through `src/lib/`.
- **Apply the system (06.4).** Every screen built so far takes the tokens, type and icons; no literal colour or
  size outside `src/ui/theme.ts`.
- **Accessibility (06.5).** Every control has a screen-reader label and role; text follows the OS text size up to
  200% without clipping; contrast meets WCAG 2.2 AA; touch targets are at least 44 px; emotion chips never carry
  meaning by colour alone. The e2e leg runs an automated accessibility check (axe through Playwright) on every
  route and fails on any serious or critical issue.
- **Privacy policy (06.6).** A plain page at `https://mood-read.pages.dev/privacy` and in the app from Settings:
  what stays on the device (books, positions, picks), what the proxy receives (title, author, chapter titles, and
  public LibriVox / Gutenberg ids, D9), that it keeps no listener data, and what a connected Spotify account
  shares. It is what the stores' data-safety forms are filled from.

Decisions made upfront (do not ask):

- 06.1 and 06.2 are design chunks: boards and a decision file, no app code, as spec 03 was. The owner may pick
  among options; with no pick in a day, the loop takes the board's recommendation and records it.
- The overflow menu is the one home for Browse, Downloads, Settings and Credits; the library gains no tab bar.
- Chapter editing (01.6) is drawn by 01.6 itself, to its default (an "Edit chapters" mode from the river's
  overflow), and recorded in `design/layouts/DECISION.md` there.

## Contracts

- **Routes (new):** `/settings`, `/privacy` (web page; the app opens it). `/browse`, `/browse/[id]`, `/downloads`
  and `/credits` are spec 05's; 06.2 draws them.
- **Files:** `design/system/DECISION.md`, `design/system/board.html` (and its PNG), `design/layouts/v2/`.
- **Data:** `Settings` (wifiOnly, companionMode, defaultSoundscapeId), kept on the device.

## Acceptance

- **A1** `design/system/DECISION.md` sets palette tokens, type scale, spacing, radius, icon set (rights-checked),
  motion and voice, and `src/ui/theme.ts` holds them as the only source of colour and size.
- **A2** `design/layouts/DECISION.md` draws every screen and state spec 05 and this spec add: the library's
  overflow menu and row states, the empty library with Browse, Browse, a LibriVox book, Downloads, Credits,
  Settings, scoring's start, progress and cap states, and "Build playlist" with its progress.
- **A3** A Settings screen, reached from the library's overflow menu, holds Wi-Fi-only downloads (on by default),
  companion mode, the default soundscape, storage, connected accounts and the privacy policy, each saved on the
  device.
- **A4** Every built screen uses the design system's tokens, type and icons, with no colour or size outside
  `src/ui/theme.ts`.
- **A5** Every control has a screen-reader label; text scales to 200% without clipping; contrast meets WCAG 2.2 AA;
  touch targets are at least 44 px; and the e2e leg's accessibility check is green on every route.
- **A6** A privacy policy is live at `/privacy` on the web build and linked from Settings, and says what the proxy
  receives and that no listener data is kept.

## Open questions

- None now. The owner may overrule any board's recommendation when it lands.

## Chunks
Measure: 6 open · 0 closed · next A7

- [ ] **06.1** The design system: palette, type, icons, motion and voice, as tokens · M · closes A1 · needs —
- [ ] **06.2** The v2 layout pass: every screen and state the chapter-river decision leaves undrawn · M ·
  closes A2 · needs —
- [ ] **06.6** The privacy policy page, linked from the app · S · closes A6 · needs —
- [ ] **06.3** Settings, from the library's overflow menu · S · closes A3 · needs 06.2, 06.6
- [ ] **06.4** Apply the design system to every built screen · M · closes A4 · needs 06.1
- [ ] **06.5** Accessibility pass, with an automated check in the e2e leg · M · closes A5 · needs 06.4
