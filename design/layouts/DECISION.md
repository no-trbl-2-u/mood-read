# Layout decision: option B, chapter river

## The pick

The owner picked **option B, chapter river**, on 2026-10-23, at the `/heads-down` question gate, answering spec 03
Open questions 1 ("Which layout?"):

> "B, chapter river (Recommended)"

Plain option B: no parts are borrowed from A or C. `option-a.html` and `option-c.html` (and their PNGs) stay in
this folder as reference only; nothing is built to them. The board this contract is read from is
[`option-b.html`](./option-b.html). Where the board is silent, the contract below says so and names the plain
default taken, marked **Default**.

## Navigation model

- **A two-level stack, no tab bar.** Library is the root. Tapping a book pushes that book's chapter river. The
  board draws no tab bar on any frame.
- **Import** is a full screen pushed from the library ("Import a book"). The AAX/AAXC note is a state of it.
- **Two bottom sheets over the river:** Speed & Sleep, and Bookmarks. Each rises from just above the docked mini
  player, with a handle, over a dimmed river; the mini player stays undimmed below it. (The board's captions say
  "popover"; the drawing is a bottom sheet, and that is what is built.)
- **Never a sheet:** the mixer and the mood card. Both live inline in the expanded chapter row.
- **Lock screen:** the OS draws it; Mood Read only supplies metadata and handles its commands.
- **Default:** the river's top bar gets a leading back control to Library (the board draws the title only).
- **Default:** Speed & Sleep and Bookmarks open from two trailing buttons in the river's top bar. The board
  shows the sheets open but draws no button that opens them.

## The docked mini player

Docked at the bottom of the book's river (64 px tall on the board, full width, top rule) and of every state over it. Left to
right: a small square cover, the playing chapter's title over a thin progress bar, and a play/pause button at
the right edge. It is always in thumb reach.

- The board's two library frames show no mini player. **Default:** keep it so; the playing book is marked on its
  cover in the library (as drawn) and a tap returns to its river.
- The board shows no skip buttons anywhere in the app. **Default:** the mini player carries back 30 s and forward
  30 s either side of play/pause (spec 01 A1), and its progress bar is the scrubber.

## Screens and states, top to bottom

**Library, empty.** Status bar; top bar "Library"; then, centred in the body: a placeholder cover with "+",
"No books yet", a muted line "Import an audiobook file to start a chapter river.", and a primary "Import a
book" button. Nothing else on the screen.

**Library, with books.** Top bar "Library"; a plain vertical list, one row per book: a portrait cover thumbnail
on the left, then title (bold) over a muted line of chapter count and state ("12 ch · resuming Ch.7", "9 ch ·
not started", "21 ch · 3% done"). The book in progress has a play mark on its cover. **Default:** an "Import"
action sits in the top bar once books exist (the board draws none on this frame).

**Chapter river, mid-chapter.** Top bar with the book title. The body is one scrolling list of every chapter,
then the mini player.
- Reached chapters (collapsed): title, and under it two emotion chips with intensity ("Curious 70%").
- The playing chapter (expanded in place, marked by a heavy left rule and a play mark after its title), top to
  bottom: its emotion chips (all of them, three here); the named piece; a muted line of alternates; a rule; a
  "Mixer (inline)" label; a balance slider; then "Duck" with its state chip and "Layer" with the current
  soundscape chip ("Night Wind").
- Chapters not yet reached: muted title with a lock mark, no chips.
- Unscored chapter: title with a dashed "Unscored" chip on the right, no emotion chips.
- The board shows the expanded row mid-screen, out of the easiest thumb reach. **Default:** on opening a book
  the river scrolls so the playing row is in view; only the playing row is expanded.

**Chapters.** There is no separate chapter list: the river collapsed is the chapter list (the board's
"Chapters" frame is the same river with no row expanded). **Default:** tapping a row's title jumps playback to
that chapter's start and expands it.

**Speed & Sleep (bottom sheet).** Title "Speed & Sleep"; "Speed" with preset chips 0.5x, 1.0x, 1.5x, 2.0x,
3.0x; "Sleep timer" with chips 15 min, 30 min, 45 min, Off. **Default:** add an "End of chapter" chip to the
sleep row (spec 01 A2 needs it; the board omits it).

**Bookmarks (bottom sheet).** Title "Bookmarks"; a list of rows, each "Ch. N — mm:ss" over a muted quoted name;
at the bottom, in thumb reach, a primary "+ Add bookmark at 12:47" (the current position). **Default:** tapping a
row jumps there; adding one opens an inline name field in the new row (the board does not show naming).

**Mixer (inline, in the expanded row).** The board's zoomed frame shows the full set, top to bottom: Balance
(slider), Master volume (slider), Duck under voice (On / Off chips), Layer (chips: Off, Rain, Hearth Fire, Night
Wind, Tide, Static Hush, Low Café). The collapsed inline form in the river shows only balance, duck and layer.
**Default:** the expanded row holds the full mixer as zoomed, inline, the layer chips in one horizontally
scrolling row; it is never a sheet or a separate screen.

**Mood card, reached chapter.** Not a separate card: it is the expanded row's mood part, shown zoomed. Top to
bottom: emotion chips with intensity, "Named piece" with the piece's name, "Alternates" with the alternates
listed muted. **Default:** tapping a reached, non-playing row's chips expands it in place to the same card
without moving playback; the saved pick over auto (spec 01's 01.4) is a tap on an alternate there.

**Mood card, chapter not yet reached.** The row shows the muted title and a lock mark, and no emotions (spec 01
A21). The board draws no expanded card for it. **Default:** an unreached row does not expand to a card; its
title still jumps playback.

**Unscored chapter.** In the river: title plus a dashed "Unscored" chip. Expanded (zoomed frame): the "Unscored"
chip, then the muted text "Not enough has been written about this chapter to score it. Shown unscored, never
guessed." No emotion chips, no named piece.

**Import note, AAX/AAXC (spec 01 A7).** A full screen, top bar "Import", no mini player. Top to bottom: a
placeholder file tile reading "AAX"; heading "Can't open this file"; a paragraph naming the file, saying it is
Audible-encrypted (AAX/AAXC) and that Mood Read never decrypts Audible files nor asks for the Audible password;
a muted line "Convert your own purchase to M4B/M4A first, then import that file instead."; then a primary
"Choose another file" and a secondary "Learn more", stacked at the bottom of the content.

**Lock screen (OS-drawn).** Time and date; a row with the cover, the chapter title and, muted, the book title; a
progress bar with elapsed and total times; three controls (back, play/pause, forward). **Default:** back and
forward are skip 30 s (spec 01 A1, A4); the board's glyphs do not say which.

## v2: the screens and states spec 05 and spec 06 add (06.2)

Spec 06's 06.2 draws every screen and state the boards above leave undrawn (spec 06 A2), in option B's grammar
(two-level stack, no tab bar, inline over sheets) and in the design system's option A, acid sticker
(`design/system/DECISION.md`). Everything above still holds; this section adds to it and says so where a v2 frame
changes a v1 one.

### The boards

Two boards in [`v2/`](./v2/), in option B's frame format: one horizontal row of 390x844 phone frames, a caption
under each naming the screen or state and its route. They share [`v2/frames.css`](./v2/frames.css), whose values
mirror `src/ui/theme.ts`, and [`v2/icons.js`](./v2/icons.js), which inlines the Lucide icons used. Books, readers,
moods and pieces on them are invented.

- [`v2/library-and-screens.html`](./v2/library-and-screens.html) / [PNG](./v2/library-and-screens.png): 11 frames,
  the library (empty with Browse, every row state, the overflow menu, a row's menu), Browse, a LibriVox book
  (scored; unscored and downloading), Downloads (the queue; empty on the web build), Credits and Settings.
- [`v2/river-states.html`](./v2/river-states.html) / [PNG](./v2/river-states.png): 9 frames, the river's
  scoring states (start, progress with the first-run line, the cap, rescore), "Build playlist" (start, progress,
  ready), and two frames sketching the options considered.

Each PNG is a full-page headless Chromium capture through Playwright (viewport 1400 x 900, device scale 1, after
`document.fonts.ready`), taken by a throwaway script kept outside the repo, as 06.1's board was. There is no repo
screenshot script. Frames are named below by their `id` on the board (`v2-lib-empty` and so on).

### Navigation, v2

- **The library's top bar** reads "Your shelf" (06.1's voice; v1's "Library" frames give way to it when 06.4
  applies the system), in `title` type. Trailing: "Import" (Lucide `plus`, pushes `/import` as before) and the
  overflow button (Lucide `ellipsis-vertical`, labelled "More"). While downloads run, the overflow button carries
  a `pop` badge with their count. The empty library draws only the overflow button.
- **The overflow menu is the one home for Browse, Downloads, Settings and Credits** (spec 06, decided upfront).
  The library gains no tab bar, and Credits never appears on the player or the river (spec 05).
- **The stack stays two-level from the library's point of view:** `/` pushes `/browse` (which pushes
  `/browse/[id]`), `/downloads`, `/settings` and `/credits`; `/book/[id]` and `/import` as in v1. Settings may push
  Downloads (its Storage row) and Credits, and opens the privacy policy (`/privacy`, 06.6) in the browser. Every
  pushed screen's back control is a `chevron-left` plus the parent's title ("Your shelf", "Browse").
- **Menus are popovers, not sheets.** Anchored under the button that opened them, right-aligned: `raised` fill,
  2 px `edge` outline, `lg` radius, the card shadow in `pop`, 48 px rows each with a Lucide icon and a label. No
  handle and no scrim; a tap outside, the back gesture or Escape closes it, and focus returns to its button.
  Speed & Sleep and Bookmarks stay the only bottom sheets.
- **A confirmation is inline in the menu that asked for it** (Delete book, Rescore): the menu grows a short
  question and two buttons under the item. Never a dialog or a sheet.

### Library, empty, with Browse (`v2-lib-empty`, route `/`)

Top bar "Your shelf" with only the overflow button. The body, left-aligned with 28 px sides, vertically centred:
the `display` line "Nothing on the shelf yet." ("shelf" in `pop`); the body line in `textMuted` "Add an audiobook
you own, or grab a free one, and we'll read the room, chapter by chapter." (06.1's sample, widened to name free
books); three decorative emotion stickers (Wonder, Joy, Dread, no percentages, hidden from screen readers); then
two full-width buttons stacked, **"Import a book"** (primary, `plus`) over **"Browse free books"** (secondary,
`search`); then a centred caption "Free books are public-domain recordings from LibriVox." This replaces v1's
empty frame ("No books yet").

### Library, with books: row states (`v2-lib-rows`, route `/`)

Each row: the cover (52 x 70), then title (`body` bold), author, and a meta line: the v1 caption ("12 ch ·
resuming Ch.7") followed by state chips; a trailing overflow button (44 px, "More for <title>") opens the row's
menu. The book in progress keeps the play mark on its cover. Tapping the row opens its river, as in v1.

The meta line's states, left to right, never colour alone (each is a word):

- **Where the file is.** Downloading: the caption reads "Downloading 62%" in `accent`, then "412 of 664 MB", and a
  thin 6 px bar sits under the row's text. **"Not on device"**: a dashed `textMuted` chip with Lucide `cloud-off`
  (the one state chip that looks absent, like "Unscored"), and the cover drops to 45% opacity.
- **Scoring.** **"Scoring 40%"**: `accent` text and outline on `surface` (live, so it reads as in progress).
  **"Scored"**: `accent` fill, `onAccent` label, the small chip shadow. A book never scored shows nothing here
  (the "Unscored" chip stays a chapter's state, never a book's).
- **"Finished"**: `pop` fill, `onAccent` label, Lucide `check`. A finished book's caption keeps only its chapter
  count ("24 ch"); the chip replaces v1's "· finished" text.

State chips do not tilt (they are status, not stickers) and use `label` type at 12 px. **Default:** a row shows at
most three states, in the order above. A downloading book's row opens its river; play waits until the file is
there. A "Not on device" book's row opens its river with its place, bookmarks, moods and mix; the river's action
band (below) then offers "Download again" (a LibriVox book) or "Find the file" (an imported book, matched by
title, author and duration, spec 05.7).

### Library, overflow menu (`v2-lib-menu`, route `/`)

The menu under the top bar's overflow button, the list behind it dimmed to 55% (no scrim). Items, top to bottom:
**"Browse free books"** (`search`), **"Downloads"** (`download`, with a "2 running" chip while any run),
**"Settings"** (`settings`), a hairline, **"Credits"** (`heart`). Credits sits last, under a rule, "a little off to
the side" (spec 05).

### Library, a row's menu (`v2-lib-row-menu`, route `/`)

The row raised (`raised` fill) and its menu under its overflow button: **"Remove download"** (`cloud-off`, with
the line "Frees 188 MB. Keeps your place, bookmarks, moods and mix."), **"Mark finished"** (`check`; on a finished
book it reads "Mark not finished"), a hairline, **"Delete book"** (`trash-2`, in `danger`). Delete asks once,
inline: "Delete it for good?", "Its place, bookmarks, moods and mix go too.", then **"Delete book"** (a `danger`
fill, `onAccent` label, the button shadow) and **"Keep it"** (secondary). On a book that is not on the device,
the first item is "Download again" (LibriVox) or "Find the file" (imported) instead of "Remove download". Remove
download asks nothing: nothing is lost that one tap cannot bring back.

### Browse (`v2-browse`, route `/browse`)

Top bar: back "Your shelf", title "Browse". A search field (`md` radius, 2 px `edge` outline, Lucide `search`,
a clear `x` once it holds text), placeholder "Title, author or genre", with the caption "Title, author or genre.
Free public-domain recordings from LibriVox." under it. Results, one row each: cover, title, a caption "Lewis
Carroll · 2 h 54 min · 12 ch", and on a pre-scored book (05.10) the "Scored" chip then its top two **overall**
emotion chips ("Wonder 80%", "Joy 60%"), the book's and never a chapter's (spec 05 A11). A book already on the
shelf adds a caption "On your shelf" with a `check`. Unscored results show no chips. Tapping a row pushes
`/browse/[id]`.

**Default:** before any search, Browse lists "Popular on LibriVox" (the pre-scored books first) under the same
field. No results: "No LibriVox books match "<query>". Try a title, an author or a genre." Offline: "Browse needs
a connection. Your shelf still plays offline." in `danger`, with a "Try again" secondary button.

### A LibriVox book (`v2-book-scored`, `v2-book-downloading`, route `/browse/[id]`)

Top bar: back "Browse", no title (the page's own heading names the book). Top: the cover (116 x 156) beside the
title (`heading` at 24 px), author, readers ("Read by June Ashby and 6 other volunteers"), and length ("3 h 41 min
· 12 chapters · 168 MB"). Then the section "The whole book's mood": when scored, the "Scored" chip and all its
overall emotion chips (at most three), with the caption "Chapters stay a surprise until you reach them." (A21:
chapter moods are never shown before the listener reaches them); when not scored, the line "Not scored yet. Once
it's on your shelf, "Score this book" reads its mood." Then **"Download"** (primary, full width, `download`) with
the caption "Downloads on Wi-Fi only. Change it in Settings." while that setting is on. Then "Chapters": a card of
rows, number and title beside its length (this list is a catalogue, so times are allowed here; A28 bars them only
from the river).

Downloading (`v2-book-downloading`): the Download button gives way, in place, to a card: "Downloading 38%" in
`accent`, "14 of 36 MB", a bar, then **"Pause"** (secondary, becomes **"Resume"**) and a "See all downloads" link
to `/downloads`. **Default:** once done, the card becomes a primary **"Open on your shelf"**, which opens the
book's river; a failed download shows the Downloads row's error line and **"Retry"** here too.

### Downloads (`v2-downloads`, `v2-downloads-web`, route `/downloads`)

Top bar: back "Your shelf", title "Downloads". Top to bottom:

- **The storage meter**, a card: "Storage" with the caption "1.2 GB used · 21.4 GB free"; one bar split into books
  (`accent`) and music (`pop`) in proportion to what Mood Read holds; a legend of two small chips, "Books 1.1 GB"
  and "Music 96 MB" (spec 05 A6: books and music apart).
- The caption "Downloads on Wi-Fi only. Change it in Settings." (Lucide `wifi`) while the setting is on. Off
  Wi-Fi with it on, running items show "Waiting for Wi-Fi" instead of a percentage.
- **"In the queue"**: one card per download, title over a caption of kind and progress ("Book · 62% · 412 of 664
  MB"), a thin bar, and one trailing button that says what it does: **"Pause"** (running), **"Resume"** (paused,
  the bar in `textMuted`), **"Retry"** (failed: the card's outline turns `danger` and the caption says what
  happened and what next, "The connection dropped. Retry, or it tries again on its own in a minute."). Queued
  items read "Book · queued" with no button.
- **Default:** a book's playlist is one item, "Playlist · 5 of 12 pieces · 41 of 96 MB", its bar in `pop`, not
  twelve rows. Finished items leave the queue; the storage meter and the book's row show the result.

Empty (`v2-downloads-web`, drawn on the web build): the meter, then the web note in a bordered card (Lucide
`hard-drive`) "On the web, Mood Read keeps one book and its music offline. The phone app keeps your whole shelf."
(spec 05: the web build streams), then centred: `display` "All caught up." ("caught up." in `pop`), "Nothing
downloading. Free books are a search away.", and **"Browse free books"** (secondary). On a phone the web note is
absent and the meter reads "used · free".

### Credits (`v2-credits`, route `/credits`)

Top bar: back "Your shelf", title "Credits". A `title` hero "Thanks, everyone." ("everyone." in `pop`) and the
caption "Every piece, sound and voice in Mood Read, and the license it plays under." Then grouped cards under
section labels: **Music** (each catalog piece: title, then "artist · license" as a caption, and a trailing
"Source" link with `external-link`), **Soundscapes** (one row naming the loops, which opens inline to each loop's
source and license), **LibriVox readers** (one row per downloaded LibriVox book: "Read by L. Marsh and 11 other
volunteers · public domain"), and **Open-source notices** (one row per notice: Lucide ISC, Feather MIT,
react-native-svg MIT, Bricolage Grotesque OFL, and the rest under "All notices"). A notice opens inline (the row
grows, its chevron turns down) to its full text, word for word (06.1's obligation). Nothing here is a sheet.

### Settings (`v2-settings`, route `/settings`)

Top bar: back "Your shelf", title "Settings". Grouped cards under section labels, rows 56 px or taller:

- **Downloads:** **"Downloads on Wi-Fi only"** (a switch, on by default); **"Storage"** (value "1.2 GB", a
  chevron, pushes `/downloads`).
- **Listening:** **"Companion mode"** (a switch, off by default) with the caption "Plays Mood Read's soundscape
  beside another app. It arrives in a later update; your choice is saved now." (01.14 brings the behaviour);
  **"Default soundscape"** (value "Night Wind"), which opens inline into one horizontally scrolling row of the
  layer chips (Off and the bundled loops, the selectable-chip style), never a sheet or a new screen.
- **Connected accounts:** **"Spotify"**, shown disabled at 55% with the value **"Not available yet"** (the
  owner's call), no switch and no Spotify mark (Lucide carries no brand icons; 06.1).
- **About:** **"Credits"** (chevron, pushes `/credits`) and **"Privacy policy"** (`external-link`, opens
  `/privacy`).

Switches are 52 x 32, `accent` with an `onAccent` knob when on and an `edge` outline either way, and announce
their state (`role="switch"`, `aria-checked`). Each setting saves on the device as it changes (06.3, through
`src/lib/`); there is no Save button.

### The river's top bar, v2 (every river frame of `river-states`)

The title line: back (`chevron-left`, labelled "Back to your shelf"), the book's title (`heading`, one line,
ellipsised), then the speed button reading the current speed ("1.0x", "1.5x"; v1's Speed & Sleep button), the
Bookmarks button (Lucide `bookmark`, labelled "Bookmarks"), and the river's overflow button. Under it, when there
is something to do, **the action band**: one book-level action and its progress, above a dashed hairline, inside
the top bar (it never scrolls). One band shows at a time, by this priority: "Download again" / "Find the file"
(not on device), then scoring (start, running, cap), then "Build playlist" (start, running, ready). With none of
them, the band is gone and the top bar is one line.

Chapter edits stay as 01.6 built them: "Rename", "Merge with next" and "Split at m:ss" inline under the playing
row (drawn small in `v2-river-unscored`); they are not in the overflow.

### Scoring: start (`v2-river-unscored`, route `/book/[id]`)

A book never scored: the band holds **"Score this book"** (primary, small, Lucide `sparkles`) and the caption
"Reads the mood of every chapter." Rows show no emotion chips (and no "Unscored" chip: nothing was tried yet);
unreached rows keep their lock. The playing row, where the mood card goes, reads "No moods yet. Score this book to
read each chapter's mood." above the layer and the chapter edits.

### Scoring: progress and the first-run line (`v2-river-scoring`)

The band: `sparkles` and **"Scoring 40%"** in `accent`, "4 of 10 chapters" at the right, a full-width bar. Reached
chapters' chips pop in as they land (06.1's chip pop, 220 ms), and the playing row gains its named piece; unreached
rows stay locked whatever has been scored behind them (A21). Playback never waits on scoring.

**First run:** on the first scoring on this device, the band adds one line in a bordered note, Lucide
`shield-check`: **"Only the title, author and chapter titles are sent."** with a dismiss button (`x`, labelled
"Dismiss"). Dismissed, it never shows again on this device; it is not repeated on later books.

### Scoring: the cap (`v2-river-cap`)

When the proxy's monthly cap stops a run, the band reads, Lucide `hourglass`: **"Waiting: this month's scoring
budget is spent."** and under it, in `caption`, "Chapters already scored still play." The bar stays where it
stopped, in `textMuted`, with "4 of 10 chapters". There is no button. Chapters the run did not reach show no chips
and no "Unscored" chip (they were not tried). The library row keeps its "Scoring 40%" chip. **Default:** the run
picks up by itself once the proxy takes new runs again; the band then returns to progress.

### Scoring: "Rescore" (`v2-river-overflow`, route `/book/[id]`, menu)

The river's overflow menu: **"Rescore"** (`sparkles`, "Reads every chapter's mood again."), a hairline, **"Mark
finished"**, **"Remove download"**, a hairline, **"Delete book"** (`danger`). Rescore is explicit (spec 01 A13): it
asks once, inline, "Rescore all 12 chapters?" and "It uses this month's scoring budget. The moods you see now stay
until the new ones land.", with **"Rescore"** (primary) and **"Cancel"**. Rescore shows only on a scored book;
while it runs the band shows scoring progress as above. Remove download and Delete book behave as in the
library's row menu.

### "Build playlist" (`v2-river-build`, `v2-river-building`, `v2-river-ready`)

- **Start** (`v2-river-build`): on a scored book whose pieces are not all on the device, the band holds **"Build
  playlist"** (primary, small, Lucide `list-music`) and the caption "A piece for every chapter, 96 MB, so it plays
  offline." Unscored chapters keep their "Unscored" chip and get no piece (they play narration with the
  soundscape, spec 05).
- **Progress** (`v2-river-building`): the band reads "Building playlist" (`list-music` in `pop`) and "5 of 12
  pieces", over a `pop` bar and a **"Pause"** button (then **"Resume"**). **A downloaded mark per row:** each
  chapter whose piece is on the device shows Lucide `circle-check` in `accent` at the right of its title (labelled
  "Piece downloaded"), locked rows included; the one downloading now shows `arrow-down-to-line` in `textMuted`;
  queued rows show nothing. The playing row's piece caption adds "On this phone" once it is. The same build is one
  "Playlist" item in Downloads.
- **Ready** (`v2-river-ready`): the band reads, with `circle-check`, "Playlist ready. Every chapter plays
  offline." and a dismiss `x`; it shows until dismissed or the river is left, then the band is gone. The marks
  stay on every row.
- **Default:** a changed pick (05.4, spec 05 A5) downloads the new piece with that row's mark turning from
  `arrow-down-to-line` to `circle-check`, without the band.

### Layout choices taken

Where the boards met a real choice, the options are sketched in `v2-options-band` and `v2-options-progress`, and
one is taken:

1. **Where the book-level action and its progress sit in the river: an action band under the top bar's title
   line** (option A), over an icon in the title line (B: no room for the cap or privacy line, progress shrinks to
   a ring) and a banner as the river's first row (C: scrolls away, and the river opens on the playing row).
   Recommended option taken by the loop on 2026-10-23; the owner may overrule, and any overrule is recorded here.
2. **A library row's download progress: a thin bar under the row's text, with "Downloading 62%" in words**
   (option A), over a ring on the cover (B). Recommended option taken by the loop on 2026-10-23; the owner may
   overrule, and any overrule is recorded here.
3. **"Build playlist" progress: in the band, with a downloaded mark on each row as its piece lands** (option A),
   over Downloads only (B). Recommended option taken by the loop on 2026-10-23; the owner may overrule, and any
   overrule is recorded here.
4. **Book management (Remove download, Mark finished, Delete book): a per-row overflow menu on the library,
   mirrored in the river's overflow beside Rescore**, over a long-press on the row (not discoverable, and no
   screen-reader affordance). Recommended option taken by the loop on 2026-10-23; the owner may overrule, and any
   overrule is recorded here.
5. **The empty library: "Import a book" stays the primary button, "Browse free books" the secondary under it**,
   over Browse as primary: importing your own book is Mood Read's first promise, and the v1 path stays where it
   was. Recommended option taken by the loop on 2026-10-23; the owner may overrule, and any overrule is recorded
   here.

**New colour pairs** the v2 frames draw, all from existing tokens, for 06.4 to add to `contrastPairs`: `onAccent`
on `pop` (the "Finished" chip, the running-downloads badge; 6.41:1) and `onAccent` on `danger` (the confirming
"Delete book"; 7.72:1). No new token is needed.

## What this does not decide

How things look and sound: palette, type, iconography, motion and voice are decided in
[`design/system/DECISION.md`](../system/DECISION.md) (06.1: option A, acid sticker), and their values live only in
`src/ui/theme.ts`. Option B's boards are grayscale wireframes in the system font and set no colour, size or
animation; the v2 boards are drawn in the design system's tokens so their frames read as built, but where they and
`design/system/DECISION.md` differ, the system wins. This file decides where things sit and what they say.

## Which chunks build to this

- **01.1** The library (empty and with books), the chapter river and its expanded row, the docked mini player and
  transport, chapters as the river, the Speed & Sleep and Bookmarks sheets, and the lock-screen controls.
- **01.6** The import screen and its AAX/AAXC note.
- **01.3** The layer's soundscape line ("Layer") in the expanded chapter row.
- **01.5** The mixer, inline in the expanded row: balance, master volume, duck under voice.
- **01.7** The soundscape picker: the Layer chips (Off plus the bundled loops).
- **01.4** The mood card: reached, not yet reached (no emotions), and unscored.
- **01.17** Scoring in the river: "Score this book", progress, the cap, the first-run line (the action band), and
  "Rescore" in the river's overflow.
- **05.4** "Build playlist", its progress in the band, and the downloaded mark per row.
- **05.5** Credits, from the library's overflow menu.
- **05.6** Downloads: the queue, pause, resume and retry, the storage meter, the web note.
- **05.7** The library row's menu (Remove download, Delete book) and the "Not on device" state.
- **05.8** Browse, a LibriVox book, the downloading row state, and the empty library's "Browse free books".
- **05.10** The "Scored" chip and overall emotions on Browse rows and the book page.
- **05.16** "Finished" and "Mark finished".
- **06.3** Settings, from the library's overflow menu.
- **06.4** "Your shelf", the library's overflow button, and the river's v2 top bar, as it applies the system.
