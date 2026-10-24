# Mood Read roadmap

> What is still to build, one spec per initiative, each ending in chunks sized to one session. Read by every shipping
> skill (`/next`, `/ship-a-chunk`, `/plan-a-spec`, `/march`, `/iterate`, `/oversight`) to pick the next chunk. The
> plan only shrinks: a finished chunk leaves as one line in [`ARCHIVE.md`](ARCHIVE.md).

Mood Read is an audiobook player in the spirit of Audible that scores each chapter: AI works out the emotions a
chapter evokes and names a no-vocals piece to match, and the listener hears an ambient soundscape (later, the piece)
under the narration.

---

## Lanes

**Asap** (built before the table, in this order, once their needs are done):


**Held** (waits on a person's word; never picked until the line goes):

- **05.14** · blocked: Mood Read stays the owner's own preview APK for now; no Play Store developer account
  (spec 05, Open questions) · 2026-10-23
- **05.15** · blocked: needs 05.14 and the Apple Developer Program (D6) · 2026-10-23

## Specs

| # | Initiative | Spec | Status | Progress |
|---|---|---|---|---|
| 5 | Mood Read v2: browse and download free LibriVox books, manage the library (remove a download, keep the book), a royalty-free music catalog, one button that builds and pre-downloads a book's chapter playlist, credits, Spotify chapter playlists, and the Play Store and App Store | [05-mood-read-v2.md](05-mood-read-v2.md) | planned | 16 left |
| 4 | Android preview APKs: Mood Read installed on a real phone from a preview APK built from main, before any store; iOS after v1 | [04-android-preview.md](04-android-preview.md) | planned | 1 left |
| 7 | Mood depth: scenes inside a chapter with their own pieces, a bed that fades in, fades out and holds for the narrator's opening, "Fits" / "Doesn't fit" verdicts that order alternates for every listener, a listener-seeded mood for unscored books, and a mood fingerprint and filter on the shelf with a Your soundtrack list | [07-mood-depth.md](07-mood-depth.md) | planned | 7 left |
| 1 | Mood Read v1 in two parts. Part 1, the player: your own audiobooks with an ambient soundscape under the narration and a mixer. Part 2: each chapter's moods researched by AI, with one named no-vocals piece per chapter, named but not played in v1. After v1: a streaming study, then playing the pieces (01.10) | [01-audiobook-player-app-similar-to-audible.md](01-audiobook-player-app-similar-to-audible.md) | planned · priority 2 | 8 left |

## How the loop reads this folder

1. **Pick.** An explicit argument wins (`/next 02.3`). Otherwise the first ready chunk in the Asap lane, then in
   priority rows (`priority 1` first), then in table order. Within a spec, the first chunk whose `needs` are done. A
   need is done when its line is gone from every spec. Held chunks are never picked.
2. **Spec.** Read the spec end to end: Design and Contracts are decided upfront, and Acceptance says what done means.
3. **Bearings.** [`bearings.md`](bearings.md) holds stack pins, contracts, visual defaults, the sub-agent registry and
   standing decisions. Read once per session.
4. **Arrive.** New work enters through `/plot` (one task, with its place in line), `/messy` (a dump of thoughts,
   refined into specs), or `/oversight` promoting a [`CANDIDATES.md`](CANDIDATES.md) entry.

## Chunks, measure, archive

- **Chunks.** Each spec ends with `## Chunks`, listing only chunks still to build:
  `- [ ] **NN.k** <title> · S|M|L · closes A1, A2 · needs —`. S is about an hour, M a few hours, L one full session
  at most. A chunk's sub-bullets carry only real requirements.
- **Measure.** Acceptance bullets carry stable IDs (`A1`, `A2`, …), never renumbered or reused. The line reads
  `Measure: 2 open · 5 closed · next A8`, and `open + closed = next − 1`.
- **Pending.** A branch writes no shared plan line. A close or a `/plot`'s rows is one new file in `plan/pending/`,
  and the owner's settle on main (`pnpm settle`) applies it and removes the file. The owner's own work on main may
  close in place.
- **Closing shrinks the plan.** Remove the chunk's line and the A-IDs it closed, fix the Measure line, drop it from
  other chunks' `needs` and from the lanes, update the row's `N left`, and append one line to `ARCHIVE.md`.
- **Specs end.** When every ID is closed, the spec's lasting rules move to `bearings.md`'s standing decisions, the
  file is deleted, and the archive gets `· NN · spec complete: <title> · deleted in <sha>`.
- **The gate.** `node scripts/plan-check.mjs --since HEAD` (the first leg of `pnpm verify`) checks all of the above.

The full model: `nexus/concepts/plan-shape.md`.

## Layout

```
plan/
├── README.md                # this file: lanes + spec table
├── NN-<slug>.md             # one spec per initiative
├── ARCHIVE.md               # one line per finished chunk (append-only)
├── pending/                 # plan changes waiting for the owner's settle
├── nexus.lock               # the nexus kit version this plan follows
├── bearings.md              # standing context: stack, contracts, defaults, sub-agents, posture
├── AUDIT.md                 # /iterate's queue, and [needs-user-call] rows for /oversight
├── CRITIQUE.md              # external-observer findings (append-only via /critique)
└── CANDIDATES.md            # candidates from /expand, gated by /oversight
```

## Where design lands

Design exports land in `design/` at the project root whenever the owner makes them. The loop does not wait for
design: the next chunk that touches a surface integrates an export when it lands.
