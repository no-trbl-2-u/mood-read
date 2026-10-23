# 03 — Layout pass: three ways to lay out Mood Read, and the owner's pick

> The owner has compared three layout options for every v1 screen, picked one, and that pick is the layout contract
> spec 01's screens are built to.

Agent-facing spec. Every judgment call is made below except the pick itself, which is the owner's (Open questions).

## Why

From the owner (2026-10-22): "We'll need a design pass for the UI. I'd like 2 or 3 different options for the design
focused on the layout. The actual design system itself, we can work out later (but I'm leaning gen z chaotic for the
first go around)."

Verified 2026-10-22: there is no `design/` folder, and `plan/bearings.md`'s visual defaults say they hold only until a
design lands. The only UI so far is the unpushed `chunk-01.1-player` branch (a list library and a stacked player
screen, built without a layout decision). 01.1 is the first chunk that builds real screens, so the layout is decided
before it: the player is then built once, in the chosen layout.

## Design

- **Layout only.** The boards decide structure: what each screen holds, where it sits, how screens connect, what a
  thumb reaches. They use one neutral grayscale palette, the system font and plain boxes. No colors, type pairing,
  illustration or motion: that is the design system, a later spec.
- **Three options**, each a different answer to "what is the main screen while a book plays?":
  - **A, Now Playing first.** The familiar audiobook shape: a library of covers, a full-screen player with a large
    transport at thumb height, and bottom sheets for chapters, speed and sleep, the mixer and the mood card.
  - **B, Chapter river.** A book is a vertical stream of its chapters; the playing chapter is expanded in place with
    its mood, its piece and the mixer inline, and a mini player stays docked at the bottom. Moods are the spine of
    the screen, not a sheet.
  - **C, Collage.** The playing book as a loose board of overlapping cards (cover, the chapter's moods as chips, the
    named piece, a mixer dial, the transport), asymmetric and layered, swiped between chapters. It leans toward the
    owner's "gen z chaotic" while staying usable one-handed; its board says what it gives up.
- **Every option covers the same screens and states,** so they compare like for like: the library (empty and with
  books), the player mid-chapter, the chapter list, speed and the sleep timer, bookmarks, the mixer (balance, master,
  duck under voice, the layer: soundscape or off), the chapter mood card (a reached chapter, and one not yet reached,
  which shows no emotions: A21), an unscored chapter, the import note for an AAX/AAXC file (A7), and the lock-screen
  controls as the OS shows them.
- **The same fake book in all three:** a public-domain title with 12 chapters and invented moods (no real scoring),
  so content never sways the comparison.
- **Form.** One self-contained HTML file per option, `design/layouts/option-a.html`, `option-b.html`,
  `option-c.html`, each a row of phone-sized frames (390 × 844) with a caption per frame. No build step, no network,
  no dependency: it opens from disk on a laptop or a phone. A PNG of each board sits beside it
  (`option-a.png`, …) for a quick look in GitHub.
- **The comparison.** `design/layouts/README.md`: one paragraph per option, then a table scoring each on one-handed
  reach, glanceability while listening, how present moods and pieces are, how far it is from what an Audible
  listener expects, and build cost in React Native. It ends with a recommendation and why.
- **The pick (03.2).** Once the owner picks (one option, or one with named parts of another), the pick is written
  down where the build reads it: `design/layouts/DECISION.md` (the pick, the owner's words, the date), a "Layout"
  section in `plan/bearings.md` (navigation model, each screen's regions, where sheets go), and spec 01's chunks
  that build screens (01.1, 01.3, 01.5, 01.4) point at it. The other boards stay as reference.

Decisions made upfront (do not ask):

- Grayscale wireframes only; no option shows a color, logo or brand mark.
- Portrait phone frames only; tablet and web-wide layouts follow from the pick later.
- No new routes: the boards live in `design/`, outside the app and its URL contract.

Later, not in this spec: **the design system** (palette, type, motion, voice), which the owner leans "gen z chaotic"
for its first go. It will revisit `plan/bearings.md`'s provisional visual and tonal defaults (calm, dark, never cute)
when it is plotted.

## Contracts

- `design/layouts/option-{a,b,c}.html` and `.png`, `design/layouts/README.md`, and after the pick
  `design/layouts/DECISION.md`.

## Acceptance

- **A3** The owner's pick is recorded in `design/layouts/DECISION.md` and as a "Layout" section in
  `plan/bearings.md`, and spec 01's screen-building chunks point at it.

## Open questions

1. **Which layout?** A, B or C, or one with named parts of another. Asked once the boards land (03.1); answer with
   `/oversight` or by telling any session. Until then 03.2, and 01.1 behind it, wait in the Held lane. Default if the
   owner says "your call": the README's recommendation.

## Chunks
Measure: 1 open · 2 closed · next A4

- [ ] **03.2** The owner's layout pick becomes the layout contract · S · closes A3 · needs —
