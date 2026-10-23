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

## What this does not decide

Palette, type, iconography, motion and voice belong to the later design system spec. The boards are grayscale
wireframes in the system font; nothing here sets a colour, size or animation. `plan/bearings.md`'s visual and
tonal defaults hold until that spec lands.

## Which chunks build to this

- **01.1** The library (empty and with books), the chapter river and its expanded row, the docked mini player and
  transport, chapters as the river, the Speed & Sleep and Bookmarks sheets, and the lock-screen controls.
- **01.6** The import screen and its AAX/AAXC note.
- **01.3** The layer's soundscape line ("Layer") in the expanded chapter row.
- **01.5** The mixer, inline in the expanded row: balance, master volume, duck under voice.
- **01.7** The soundscape picker: the Layer chips (Off plus the bundled loops).
- **01.4** The mood card: reached, not yet reached (no emotions), and unscored.
