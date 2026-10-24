# Design system decision: option A, acid sticker

## The pick

**Recommended option taken by the loop on 2026-10-23 (owner direction: full gen z chaotic); the owner may
overrule, and any overrule is recorded here.**

The owner set the direction at the 06.1 question gate: full gen z chaotic, meaning clashing saturated hues,
oversized display type, sticker-like chips (slight rotation, thick outlines, offset hard shadows), playful motion,
and a playful voice across the app, labels included. The board, [`board.html`](./board.html) /
[`board.png`](./board.png), draws three options inside that direction:

- **A, acid sticker (Recommended, taken).** Near-black violet ground, acid lime against hot pink, eight loud
  emotion hues; chips are die-cut stickers (ink outline, off-white hard shadow, a few degrees of tilt).
- **B, zine collage.** Warm black, photocopy cream, safety orange and cobalt; torn-tape labels, all-caps condensed
  display (Anton) over a monospace body (Space Mono).
- **C, y2k chrome.** Blue-black, chrome silver accent, holo pink and cyan glows; glossy bubble pills (Syne).

Why A: it is the loudest of the three that still costs nothing extra to build. Everything in it is a solid fill,
a border, a zero-blur React Native `boxShadow` and a static rotate: no image assets (B's torn edges and grain
need them), no gradient library and no blurred Android shadows (C needs both). It keeps the icon's near-black
violet ground. It has the most contrast headroom (its faintest text pair is 8.46:1), where B's all-caps
monospace body hurts reading at 200% text size and C's silver accent reads as "disabled" and its gloss lowers
chip label contrast. A's chips are the most literal reading of "sticker-like".

This file supersedes `plan/bearings.md`'s "Visual & tonal defaults" (palette, type, spacing and voice), as spec
06's Design says it should. Bearings' "calm and plain, never cute" voice is replaced by the voice below. Dark only
stays (spec 02's decision). The layout contract, `design/layouts/DECISION.md` (option B, chapter river), is
unchanged: this decides how things look and sound, not where they sit.

## Tokens

`src/ui/theme.ts` holds every value below and is the only place a colour or size lives. The names screens import
today (`colors.background`, `surface`, `text`, `textMuted`, `accent`, `border`, `onAccent`, `scrim`, `danger`,
`spacing.*`, `radii.*`, `typography.title/body/caption`) all keep working; 06.4 moves every screen onto the full
set and removes any literal colour or size left outside the file.

### Palette (dark only)

| Token | Value | Use |
|---|---|---|
| `background` | `#0e0b14` | The ground: near-black violet. |
| `surface` | `#1a1524` | Cards, rows, sheets. |
| `raised` | `#262035` | One step up: the expanded (playing) row, a pressed card, a sheet header. |
| `text` | `#fbf8ff` | Primary text. |
| `textMuted` | `#c4bad6` | Captions, metadata, the "Unscored" chip. |
| `accent` | `#c6ff3d` | Acid lime: primary buttons, the selected chip, the playing row's left rule, links. |
| `onAccent` | `#0e0b14` | Text and glyphs on the accent and on every emotion hue. |
| `pop` | `#ff4fa3` | Hot pink, the clash: hard shadows under buttons and the playing row, a display word's second hue. |
| `ink` | `#0e0b14` | A sticker's outline (ground-coloured, so a sticker reads as cut out). |
| `edge` | `#fbf8ff` | A sticker's die-cut edge and chip shadow; the visible boundary of a secondary button. |
| `border` | `#3a3150` | Decorative hairline between rows (1.61:1). Never a control's only boundary. |
| `focus` | `#4de8ff` | The focus ring. |
| `scrim` | `rgba(5, 4, 9, 0.72)` | The dim over the river while a sheet is open. |
| `danger` | `#ff7a7a` | An error line; the fill of the confirming "Delete book" (label in `onAccent`). |
| `transparent` | `transparent` | No paint: a border kept for layout but not drawn (06.4). |

A cover with no art is a muted tile tinted from the book's id, `coverTint(hue)` (`hsl(hue, 30%, 28%)`), with
its initials in `text`; it is the one computed colour, and it lives in `theme.ts` with the rest (06.4).

### Emotion hues

One hue per emotion in spec 01's fixed set (01.2: tension, sorrow, wonder, joy, dread, calm, romance, triumph),
exported as `EMOTIONS` and `emotionHues`. A chip is the hue as fill with its label in `onAccent`, and **the label is
always present** ("Wonder 80%"): colour never carries the meaning alone. 01.2 must name emotions from this set; a
new emotion means a new hue here and a new row in the contrast table.

| Emotion | Hue |
|---|---|
| tension | `#ff6a3d` |
| sorrow | `#6f93ff` |
| wonder | `#4de8ff` |
| joy | `#ffe03d` |
| dread | `#c77dff` |
| calm | `#5dffb0` |
| romance | `#ff6fb5` |
| triumph | `#ffb22e` |

`wonder` and `focus` share a hue on purpose (both "look here"); the focus ring is an outline outside the control,
offset 2 px, never a fill, so the two never read the same.

### Type scale

Display face: **Bricolage Grotesque** (SIL Open Font License 1.1, from Google Fonts). 06.4 bundles it from
`@expo-google-fonts/bricolage-grotesque` through `expo-font`, and only the 800 weight (ExtraBold), the one weight
the scale draws in the display face: `fonts.display` is `BricolageGrotesque_800ExtraBold`, loaded by
`src/app/_layout.tsx` before the first screen draws. Because the file is the weight, the display tokens set no
`fontWeight` (a weight on top makes a browser draw a fake bold). Its OFL text is on the in-app licenses screen
(`/licenses`) and in `/licenses.txt`. Body text stays the system font.

| Token | Size / line height | Weight | Face | Use |
|---|---|---|---|---|
| `display` | 44 / 46, tracking -1 | 800 | display | A screen's hero word (empty states, "Finished"). |
| `title` | 30 / 34, tracking -0.5 | 800 | display | A screen title ("Your shelf", a book's title). |
| `heading` | 20 / 24 | 800 | display | The named piece, a sheet title. |
| `body` | 16 / 22 | 400 | system | Paragraphs, row titles. |
| `label` | 14 / 18 | 700 | system | Chips, buttons, settings rows. |
| `caption` | 13 / 18 | 400 | system, `textMuted` | Metadata, times. |
| `meta` | 12 / 16 | 400 | system, `textMuted` | The mini player's times; the 12 px state chips (06.4, from the v2 boards). |

Every size follows the OS text size (06.5 holds the 200% bar); nothing sets `allowFontScaling={false}`.

### Spacing, radius, strokes, shadows

- **Spacing** (4-point): `xxs` 2, `xs` 4, `sm` 8, `md` 16, `lg` 24, `xl` 32, `xxl` 48.
- **Radius:** `sm` 8 (small tiles), `md` 14 (inputs, the mini player's cover), `lg` 22 (rows, cards, sheet tops),
  `pill` 999 (chips, buttons).
- **Strokes:** `hairline` 1 (row dividers), `outline` 2 (a chip's ink outline, the focus ring), `heavy` 3 (a
  button's outline), `rule` 6 (the playing row's left rule, in `accent`).
- **Hard shadows** (zero blur, offset down-right): chip 3/3 in `edge`; button 4/4 in `pop`; the playing row
  6/6 in `pop`.
- **Sizes** (`sizes`, fixed control sizes; 06.4 moved every screen's last literal size here): `touch` 44 (the
  smallest target, every icon button), `menuRow` 48, `settingRow` 56, `menuWidth` 250, the switch 52 x 32 with
  a 22 knob, `topBar` 52, `button` 48, `play` 48 (the mini player's play), a library row's cover 52 x 70
  (`coverWidth`, `coverHeight`), `miniCover` 44, `coverMark` 20, the import note's file tile 72 x 88, the sheet
  handle 40 x 4, `track` 6 (progress bars, the slider track), `thumb` 24 (the slider's), `readout` 48 (the
  speed between Slower and Faster), `inputMin` 160.
- **Opacities:** `disabled` 0.55 (an unavailable row, a disabled button), `behindMenu` 0.55.
- **Tilt:** chips rotate by `tilts` (-3, 2, -1.5, 3, -2, 1 degrees), cycled by index so a row never lines up.
  Buttons, rows and text never tilt. Tilt is static and stays under reduce motion (it is shape, not motion).

### Components

- **Emotion chip:** hue fill, `label` type in `onAccent`, 2 px `ink` outline, chip shadow, tilted, pill radius.
- **Unscored chip:** no fill, 2 px dashed `textMuted` outline, `textMuted` label, no shadow, no tilt: it is the
  one chip that must look absent.
- **Selectable chip** (speed, sleep, layer): off is `surface` fill with an `edge` outline; on is `accent` fill
  with `onAccent` text and the chip shadow. The on state is also announced (`aria-pressed`), never colour alone.
- **Primary button:** `accent` fill, `onAccent` label, 3 px `ink` outline, button shadow in `pop`, pill radius,
  at least 44 px tall. **Secondary:** transparent, 3 px `edge` outline, `text` label.
- **Rows:** `surface`, `lg` radius, hairline `border`. The playing row is `raised`, with the 6 px `accent` left
  rule and the card shadow in `pop`.
- **Focus:** a 2 px `focus` outline, offset 2 px, on every focusable control.

## Iconography

**Lucide**, through **`lucide-react-native` v1.x only** (which needs `react-native-svg`). 06.4 installed both
and replaced the hand-drawn glyphs with `src/ui/Icon.tsx`, the one place an icon is drawn. Size `icons.size` 24
(`icons.small` 18 inline in text or beside a label, `icons.mark` 10 in a cover's play badge), stroke width
`icons.strokeWidth` 2.5 to match the sticker outlines, coloured from the palette. Skip 30 s is `rotate-ccw` /
`rotate-cw` over a "30".

**Rights check: allowed** (the `rights-checker`, checked 2026-10-23).

- `lucide-react-native` is ISC, "Copyright (c) 2026 Lucide Icons and Contributors". Icons derived from Feather
  are MIT, "Copyright (c) 2013-present Cole Bemis". The peer dependency `react-native-svg` is MIT,
  "Copyright (c) [2015-2016] [Horcrux]".
- No visible credit beside icons is required. Recolouring and resizing are allowed.
- **Obligation:** all three notices, word for word (copied from each installed package's LICENSE at install
  time), on an in-app open-source licences / Credits screen and in a licences file served with the web build.
  06.4 does that when it installs the packages.
- **No brand icons:** Lucide v1 removed them; do not add brand logos from elsewhere (a Spotify mark, for
  instance, follows that brand's own guidelines, not this set).
- Sources: https://lucide.dev/license, https://lucide.dev/guide/version-1,
  https://lucide.dev/brand-logo-statement,
  https://raw.githubusercontent.com/software-mansion/react-native-svg/main/LICENSE.

The board inlines a few Lucide paths (play, pause, chevron-left, ellipsis-vertical, bookmark, lock, plus) and
carries the notices in its footer.

## Motion

Playful, short, and never in the way of listening. Durations in ms, from `motion` and `easings`:

| Motion | Duration | Easing | Notes |
|---|---|---|---|
| Row expand / collapse (the river) | 260 | `bounce` (0.34, 1.56, 0.64, 1) | A small overshoot on open; collapse uses `standard`. |
| State crossfade (empty to list, unscored to scored) | 180 | `standard` (0.2, 0, 0, 1) | |
| Chip pop-in (scoring lands) | 220 | `bounce` | Scale 0.6 to 1 with the chip's tilt. |
| Press (chips, buttons) | 90 | `standard` | Scale to 0.94 and back; the hard shadow shrinks to 0 while pressed ("pushed in"). |
| Sheet rise | 240 | `standard` | `exit` (0.4, 0, 1, 1) on dismiss. |
| Chapter-boundary audio crossfade | 2000 | equal-power | The soundscape / piece crossfade (spec 01, 01.3); sound, not motion. |

**As built (06.4):** the press is instant (no tween yet), from `src/ui/motion.ts`: a pressed chip or button
drops its hard shadow and, unless reduce motion is on, scales to `pressScale`. No other screen animates yet.

**Reduce motion:** with the OS setting on, every visual duration is 0 and nothing bounces or scales; the audio
crossfade is unchanged. Nothing loops, flashes or moves on its own while a book plays.

## Voice

Playful, quick and a bit cheeky: a friend who is into your book, not a narrator. Labels may play too. The rules
that keep it honest:

1. **No emojis, anywhere** (agents.md rule 2), and no emoticons standing in for them.
2. **The name is exactly "Mood Read".** Never lowercased, abbreviated or punned on.
3. **Actions say what they do.** A button's label names its action plainly enough that a newcomer and a screen
   reader know what happens ("Import a book", "Score this book", "Rescore"). The play goes in headings, empty
   states and moments of delight, not in the verb.
4. **Fixed copy is never rewritten for fun.** Privacy, scoring-cap, licensing, Audible and error lines stay
   literal and unambiguous. The fixed lines today:
   - "Unscored" (the chip, exactly that word).
   - "Waiting: this month's scoring budget is spent." (the cap state; a playful second line may follow, and it
     must stay true: "Chapters already scored still play.")
   - "Only the title, author and chapter titles are sent." (first scoring).
   - The AAX/AAXC note: Mood Read never decrypts Audible files and never asks for the Audible password.
5. **Errors say what happened and what to do next**, in one or two short sentences, no blame, no jokes.
6. **Exclamation marks:** at most one, only in a celebration ("Finished"), never in an error, privacy or cap line.
7. **Sentence case** for everything except the name. No all-caps text (screen readers spell some of it out).
8. **Never a chapter's events** (spec 01, A21): playful copy about a chapter talks about its mood, never its plot.

Samples (the board's voice sheet; 06.4 applies them, 06.2 draws them):

| Where | Copy |
|---|---|
| Library title | Your shelf |
| Empty library | Nothing on the shelf yet. Add an audiobook you own and we'll read the room, chapter by chapter. |
| Primary button | Import a book |
| Unscored chip | Unscored |
| Unscored, expanded | Not enough is written about this chapter to read its mood. It stays unscored. We never guess. |
| Cap reached | Waiting: this month's scoring budget is spent. |
| First scoring | Only the title, author and chapter titles are sent. |
| Open error | That file won't open. Pick an audio file you own: MP3, M4A, M4B, WAV, FLAC or OGG. |
| Finished | Finished. That's the whole book. |

## Contrast (WCAG 2.2 AA)

Every foreground/background pair the app draws is listed in `contrastPairs` in `src/ui/theme.ts` and asserted by
`src/lib/contrast.test.ts`: 4.5:1 for text, 3:1 for UI components (the focus ring, a control's boundary, the
playing row's rule). Ratios to two decimals:

| Pair | Foreground | Background | Ratio | AA bar |
|---|---|---|---|---|
| text on background | `#fbf8ff` | `#0e0b14` | 18.55:1 | 4.5:1 |
| text on surface | `#fbf8ff` | `#1a1524` | 16.97:1 | 4.5:1 |
| text on raised | `#fbf8ff` | `#262035` | 14.90:1 | 4.5:1 |
| textMuted on background | `#c4bad6` | `#0e0b14` | 10.53:1 | 4.5:1 |
| textMuted on surface | `#c4bad6` | `#1a1524` | 9.64:1 | 4.5:1 |
| textMuted on raised | `#c4bad6` | `#262035` | 8.46:1 | 4.5:1 |
| onAccent on accent | `#0e0b14` | `#c6ff3d` | 16.51:1 | 4.5:1 |
| accent on background | `#c6ff3d` | `#0e0b14` | 16.51:1 | 4.5:1 |
| accent on surface | `#c6ff3d` | `#1a1524` | 15.10:1 | 4.5:1 |
| pop on background | `#ff4fa3` | `#0e0b14` | 6.41:1 | 4.5:1 |
| pop on surface | `#ff4fa3` | `#1a1524` | 5.86:1 | 4.5:1 |
| danger on background | `#ff7a7a` | `#0e0b14` | 7.72:1 | 4.5:1 |
| danger on surface | `#ff7a7a` | `#1a1524` | 7.07:1 | 4.5:1 |
| danger on raised | `#ff7a7a` | `#262035` | 6.20:1 | 4.5:1 |
| onAccent on pop (the Finished chip, the downloads badge) | `#0e0b14` | `#ff4fa3` | 6.41:1 | 4.5:1 |
| onAccent on danger (the confirming Delete book) | `#0e0b14` | `#ff7a7a` | 7.72:1 | 4.5:1 |
| onAccent on tension | `#0e0b14` | `#ff6a3d` | 6.86:1 | 4.5:1 |
| onAccent on sorrow | `#0e0b14` | `#6f93ff` | 6.77:1 | 4.5:1 |
| onAccent on wonder | `#0e0b14` | `#4de8ff` | 13.28:1 | 4.5:1 |
| onAccent on joy | `#0e0b14` | `#ffe03d` | 14.84:1 | 4.5:1 |
| onAccent on dread | `#0e0b14` | `#c77dff` | 7.25:1 | 4.5:1 |
| onAccent on calm | `#0e0b14` | `#5dffb0` | 15.23:1 | 4.5:1 |
| onAccent on romance | `#0e0b14` | `#ff6fb5` | 7.61:1 | 4.5:1 |
| onAccent on triumph | `#0e0b14` | `#ffb22e` | 10.83:1 | 4.5:1 |
| focus ring on background | `#4de8ff` | `#0e0b14` | 13.28:1 | 3:1 |
| focus ring on surface | `#4de8ff` | `#1a1524` | 12.15:1 | 3:1 |
| focus ring on raised | `#4de8ff` | `#262035` | 10.67:1 | 3:1 |
| edge on background | `#fbf8ff` | `#0e0b14` | 18.55:1 | 3:1 |
| edge on surface | `#fbf8ff` | `#1a1524` | 16.97:1 | 3:1 |
| accent on raised (rule, selected chip) | `#c6ff3d` | `#262035` | 13.26:1 | 3:1 |

`border` (`#3a3150`, 1.61:1 on the ground) is decorative only and is in no pair: no control relies on it for its
boundary. `scrim` is translucent and carries no text.

## The board

[`board.html`](./board.html) opens straight from disk. It loads its four OFL faces (Bricolage Grotesque, Anton,
Space Mono, Syne) from Google Fonts for the board only, and falls back to system fonts offline.
[`board.png`](./board.png) is a full-page Playwright Chromium screenshot (viewport 1400 x 900, device scale 1,
after `document.fonts.ready`), the same headless-browser capture spec 03's boards used. Option A's values on the
board mirror `theme.ts`; B's and C's exist only on the board.

## Which chunks build to this

- **06.2** draws the v2 screens in these tokens and this voice.
- **06.4** applies the system to every built screen, installs `lucide-react-native` and `react-native-svg`
  (with the three notices on Credits and in the web build's licences file), and bundles Bricolage Grotesque.
- **06.5** holds the accessibility bar: the contrast table above, 44 px targets, 200% text, labels on chips.
