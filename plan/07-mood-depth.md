# 07 · Mood depth: scenes inside a chapter, a bed that enters and leaves, a listener's say, a mood lens on the shelf

> The score follows the chapter's arc instead of sitting on one loop; the bed fades in, fades out and gives the
> narrator's opening its silence; a listener can rate what plays and seed a mood for a book nobody wrote about; and
> the shelf shows each book's emotional fingerprint and finds a book by mood. Every one of these reads the data v1
> and v2 already keep and plays nothing new without a license.

Agent-facing spec. Every judgment call is made below; a build that meets a new one decides it and records it in the
commit body.

## Why

The mission (spec 01, from the owner, 2026-10-22) is music chosen "based off of the emotions evoked during certain
chapters". Verified 2026-10-24 on main (`1f35154`): v1 scores one emotion set per chapter (`ChapterMood.emotions`,
`src/lib/types.ts`), names one piece per chapter and locks it until the chapter boundary (01.2, 01.4, 01.10's design);
the bed starts at full level on play, loops seamlessly, crossfades only at a chapter change (`CROSSFADE_MS` in
`src/lib/bed.ts`) and hard-stops when the sleep timer fires (`src/player/PlayerProvider.tsx`); the listener's only
say is the saved pick among the named alternates (`ChapterPlaylist.pick`); a book marked `too-little` has no exit
but a flat soundscape; and the shelf (`src/app/index.tsx`) shows no emotion data at all, though every scored book
holds it. Spec 05 adds sort, filter by state and search (05.16), overall emotions only for LibriVox books in Browse
(05.10), and catalog pieces (05.1-05.3). Nothing in spec 01, 05, the archive, `plan/AUDIT.md` or `plan/CANDIDATES.md`
covers the five gaps below.

What this spec never does: show a chapter's events, or a mood before the listener reaches that point (A21 of spec
01 holds at the scene level too); send the proxy anything but a book's title, author, chapter titles and, for
feedback, a piece id with its emotion tags; play any audio without a license (A18).

## Design

- **Scenes inside a chapter (07.1, 07.2).** The scorer may return, per chapter, an ordered list of 1 to 4 *scenes*,
  each with its own emotions (the same fixed set and intensities) and a `span`: the fraction of the chapter it
  covers, in order, spans summing to 1 (`[0.4, 0.35, 0.25]`). The chapter-level `emotions` stay what they are
  (the whole chapter's, strongest first), so every v1 and v2 reader keeps working; `scenes` is optional and a
  chapter with one scene is today's behaviour. The research step asks for the scenes only when its sources
  describe a sequence (a summary with a clear beginning, middle and end); otherwise one scene. Scenes carry no
  text, only emotions and a span (spoilers, A21). A chapter's pieces follow: `ChapterPlaylist` gains optional
  `scenePieces`, one piece id per scene, picked by the same rules as the chapter's piece (research-named in v1,
  catalog ids from 05.3). The bed engine (`src/player/bed-engine.ts`) maps the clock's position within the chapter
  to a scene by its span, and crossfades to the next scene's piece when the position crosses a scene boundary, the
  same `CROSSFADE_MS` ramp as a chapter change; a seek back crosses the boundary the other way. A scene's piece is
  the alternate the listener picked for the whole chapter when they picked one (a pick covers the chapter, D?scene-
  pick). The mood card shows the playing scene's emotions under the chapter's, as a thin band of chips that changes
  as the clock crosses a boundary; an unreached scene (its start past the furthest point reached in this chapter)
  shows nothing, so the card never tells the listener what the chapter's end feels like before they get there.
- **The bed enters and leaves (07.3).** Four behaviours, all in `src/lib/bed.ts` and the engine, each a pure
  function with tests: (1) *fade-in on play*: from a cold start, a pause or a seek, the bed ramps from silence over
  `BED_ENTER_MS` (1500 ms); (2) *sleep fade-out*: a minutes timer fades the bed to silence over its last
  `SLEEP_FADE_S` (60 s; a shorter timer fades over its whole length), an end-of-chapter timer fades over the
  chapter's last 60 s, and when the timer fires the narration stops with the bed already silent; (3) *quiet
  opening*: a per-book setting (default on, in the mixer sheet beside duck) that holds the bed at silence for the
  first `OPENING_HOLD_S` (20 s) of every chapter, then ramps in over `BED_ENTER_MS`, so the narrator's chapter
  title lands clean; a seek into the middle of a chapter skips the hold; (4) *end of book*: when the last
  chapter ends the bed fades out over `BED_EXIT_MS` (4000 ms) instead of stopping with the narration. The gain is
  one multiplied chain: level × crossfade × duck × enter-exit, extending `bedVolume` in `src/lib/mix.ts`.
  Companion mode (01.14) gets the same enter and exit ramps on its play and pause.
- **The listener's say (07.4, 07.5).** On the mood card, two targets beside the playing piece: "Fits" and "Doesn't
  fit" (44 px, labelled, one may be lit). A verdict is kept on the device per book and chapter
  (`PieceVerdict`: chapter index, piece id, `fits` | `misfit`, at). "Doesn't fit" also offers the alternates right
  there, so the natural next step is a pick. Verdicts leave the device only as aggregates: once a book has a verdict
  the app posts, at most once a day and only over Wi-Fi when the Wi-Fi-only setting is on, `{pieceId, emotions:
  the chapter's emotion set, verdict}` rows with no book id, chapter index, device id or time, to `POST
  /v1/verdicts` on the proxy. The proxy keeps counts per `(pieceId, emotion set)` in its store and, when it
  answers a job view, orders a chapter's alternates with the best-kept piece first and demotes a piece whose misfits
  outnumber its fits two to one across at least ten verdicts. The privacy policy (`src/app/privacy.tsx`) gains one
  sentence saying exactly this, and the first "Fits" tap says it once in a toast. A listener can turn sending off
  in Settings ("Share what fits", on by default); verdicts stay on the device either way.
- **Seed a mood yourself (07.6).** An unscored book's river, and an unscored chapter's row, offer "Set the mood":
  a sheet with the eight emotions as chips (tap once for low, twice for high intensity, up to three lit) and
  "Apply to this chapter" or "Apply to the whole book". The result is stored as a `ChapterMood` with `coverage:
  "listener"` and no sources, and a piece is matched locally from the pieces the device already holds (every
  piece named in any scored book on the device; from 05.3 the whole catalog manifest) by overlap of mood tags with
  the lit emotions; with no piece to match the chapter plays its soundscape and the card says so. Nothing goes to
  the proxy. A later scoring run, or a rescore, replaces a listener seed only when the research returns `scored`;
  a `too-little` result keeps the seed. The card marks a seeded chapter "Your mood".
- **A mood lens on the shelf (07.7, 07.8).** Each scored book on the shelf wears its *fingerprint*: its three
  strongest emotions over the reached chapters only (a chip row under the author line in the acid sticker style,
  `src/ui/Chip.tsx`), computed by summing intensities per emotion across reached chapters; unreached chapters never
  count (A21 at the shelf). A book with no reached scored chapter shows nothing. A "Mood" filter in the shelf's top
  bar (beside 05.16's state filter once it lands; a lone chip row until then) lights one emotion and keeps only
  books whose fingerprint holds it, strongest match first. "Your soundtrack", in the library's overflow menu, lists
  every piece that has played for the listener (the device logs a piece id and the book the first time a chapter
  with that piece reaches it, never a time or position), grouped by book, with each piece's title, artist and, from
  01.11, its link-outs; it plays nothing by itself.

Decisions made upfront (do not ask):

- A scene is never shown as text. Scenes carry emotions and a span, nothing else.
- Scene spans come from the sources' proportions as the model judges them, rounded to 0.05; spans under 0.1 are
  merged into their neighbour. Four scenes at most per chapter.
- A pick covers the chapter: picking an alternate replaces every scene's piece with it (D18).
- A verdict row carries no book, chapter, device or time. The proxy never stores a raw row, only counts.
- Verdicts weigh the order of alternates; they never remove a piece the scorer named, so a listener can always
  reach it.
- The listener's seed is honest about itself: `coverage: "listener"`, "Your mood" on the card, never mixed with a
  researched mood in the fingerprint unless the book has no researched chapter.
- The quiet opening holds the bed for 20 s. Chapter one is no exception. A seek into a chapter past the hold skips
  it; a seek back to the chapter's start brings it back.
- Fingerprints count reached chapters only, and show at most three emotions.
- "Your soundtrack" logs a piece the first time it plays for a reached chapter, and a "Clear" row empties the log.

## Contracts

- **Data (extended):** `ChapterMood.scenes?: Scene[]` with `Scene = { emotions: EmotionScore[]; span: number }`;
  `ChapterMood.coverage` adds `"listener"`; `ChapterPlaylist.scenePieces?: string[]` (one per scene, same length as
  `scenes`); `PieceVerdict = { chapterIndex: number; pieceId: string; verdict: "fits" | "misfit"; at: number }`
  kept per book; `Mix.quietOpening: boolean` (default true); `Settings.shareVerdicts: boolean` (default true);
  `SoundtrackEntry = { bookId: string; pieceId: string }`.
- **Proxy (extended):** the job view's `RemoteChapter.mood` may carry `scenes`, and its `pieces` may carry
  `scenePieces`; `POST /v1/verdicts` takes `{ rows: { pieceId: string; emotions: Emotion[]; verdict: "fits" |
  "misfit" }[] }` (at most 200 rows, rate-limited per client like `/v1/score`), answers 204, and stores counts
  only. The proxy still receives no listener data: no book id, chapter index, position or device id rides with a
  verdict. `src/lib/scoring-contract.test.ts` keeps the two copies of the contract in step, as today.
- **Bed gain chain:** `bedVolume(level, crossfade, duck, enterExit)`; every ramp is a pure function of elapsed ms,
  tested, in `src/lib/bed.ts`.
- **Routes (new):** `/soundtrack` (Your soundtrack). The mood filter and fingerprints live on `/`.
- **Spoilers:** a scene shows only once the clock has reached its start in that chapter, a fingerprint counts
  reached chapters only, and a seeded mood is the listener's own words so it may show at once.

## Acceptance

- **A2** Playback crossfades to the next scene's piece when the clock crosses a scene boundary, and back on a seek
  back; a chapter-wide pick plays for every scene; the mood card shows the playing scene's emotions and nothing for
  a scene not yet reached.
- **A3** The bed ramps in from silence on play, after a pause and after a seek; a sleep timer fades the bed out
  over its last 60 s (or its whole length) and fires with the bed silent; the last chapter's end fades the bed out
  instead of cutting it.
- **A4** With quiet opening on (the default, per book, in the mixer), the bed is silent for the first 20 s of every
  chapter and then ramps in; a seek past the hold skips it; off, the bed enters at once.
- **A5** "Fits" and "Doesn't fit" on the mood card keep a verdict per chapter on the device; "Doesn't fit" offers
  the alternates in place; both are 44 px, labelled and readable at 200% text.
- **A6** Verdicts reach the proxy only as `{pieceId, emotions, verdict}` rows with no book, chapter, device or
  time, at most daily, never when "Share what fits" is off; the proxy stores counts only and orders alternates by
  them, demoting a piece with misfits two to one over at least ten verdicts; the privacy policy says so.
- **A7** An unscored book or chapter offers "Set the mood"; the lit emotions are stored as a listener mood, a piece
  the device already knows is matched by mood tags (else the soundscape plays and the card says so), nothing is
  sent to the proxy, and a later `too-little` result keeps the seed while a `scored` result replaces it.
- **A8** Each scored book on the shelf shows its three strongest emotions over reached chapters only; a book with no
  reached scored chapter shows none; a Mood filter keeps only books whose fingerprint holds the lit emotion.
- **A9** "Your soundtrack", in the library's overflow menu, lists every piece that has played for a reached chapter,
  grouped by book, with title and artist, plays nothing, and clears in one row.

## Open questions

All answered; none is open.

- **Why not a dynamic bed level driven by intensity?** Considered and left out: duck under voice already moves the
  level, and a second mover fights it. A scene change is a piece change, not a level change (decided here,
  2026-10-24).
- **Why a daily aggregate rather than a verdict sent at once?** A row sent at tap time is a timestamp the proxy
  could keep; a daily batch with no time is not (decided here, 2026-10-24).

## Chunks
Measure: 8 open · 1 closed · next A10

- [ ] **07.2** The bed follows scenes; the mood card shows the playing scene · M · closes A2 · needs —
  - `src/lib/bed.ts`: `sceneAt(positionInChapter, chapterLength, scenes)` and the boundary crossfade;
    `src/player/bed-engine.ts` drives it from the clock; `src/player/MoodCard.tsx` adds the scene band; reached
    scenes extend `src/lib/reached.ts` with the furthest position within the playing chapter. Until 01.10 plays
    pieces, the scene change is logged and the card band moves; the bed's soundscape is unchanged.
- [ ] **07.3** The bed enters and leaves: fade-in, sleep fade, quiet opening, end of book · M · closes A3, A4 ·
  needs —
  - `src/lib/bed.ts` ramps as pure functions; `bedVolume` in `src/lib/mix.ts` gains the fourth factor;
    `Mix.quietOpening` in `src/lib/mix.ts` with its row in `src/player/Mixer.tsx`; the sleep timer's fade reads
    `SleepTimer` in `src/player/PlayerProvider.tsx`; companion mode (`src/lib/companion.ts`) takes the enter and
    exit ramps. An e2e step on the web build checks the hold and the ramp through the bed's gain readout.
- [ ] **07.4** "Fits" and "Doesn't fit" on the mood card, kept on the device · S · closes A5 · needs —
  - `src/lib/verdict-store.ts` behind `src/lib/`, `src/player/MoodCard.tsx` targets, the alternates offered in
    place; the axe, 44 px and 200% checks in the e2e accessibility walk cover both.
- [ ] **07.5** Verdicts as daily aggregates to the proxy, which orders alternates by them · M · closes A6 ·
  needs 07.4
  - `POST /v1/verdicts` in `proxy/src/http.ts` with counts in `proxy/src/store.ts`, rate-limited like `/v1/score`
    (01.21's limiter when it lands, else its own); ordering in `proxy/src/pieces.ts`; the app's sender in
    `src/lib/verdict-sync.ts` reads `Settings.shareVerdicts` and `wifiOnly`; `Settings` row in
    `src/app/settings.tsx`; one sentence in `src/app/privacy.tsx`.
- [ ] **07.6** "Set the mood": a listener seeds an unscored book or chapter and a known piece is matched · M ·
  closes A7 · needs —
  - The sheet from the river's unscored state and an unscored row; `coverage: "listener"`; local matching in
    `src/lib/mood-match.ts` over the pieces the device holds (the catalog manifest once 05.1 lands); the replace
    rule in `src/lib/scoring-store.ts`.
- [ ] **07.7** Fingerprints on the shelf and a Mood filter · S · closes A8 · needs —
  - `src/lib/fingerprint.ts` over `scores:` and `reached:`; the chip row on the shelf's book row in
    `src/app/index.tsx`; the filter chip row in the shelf's top bar, built so 05.16's state filter sits beside it.
- [ ] **07.8** Your soundtrack: every piece that has played, by book · S · closes A9 · needs —
  - `src/lib/soundtrack-store.ts` logs on reach; `/soundtrack` route in `src/app/soundtrack.tsx`; one line in
    `MENU` (`src/ui/OverflowMenu.tsx`); link-outs join when 01.11 lands.
