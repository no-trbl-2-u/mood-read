# 01 · Mood Read: an audiobook player that scores each chapter

**Why:** Mood Read is an audiobook app in the spirit of Audible. Its twist is that every chapter comes with music:
AI reads the emotions a chapter evokes and picks scores, instrumentals and ambient pieces to match. The listener
hears that music under the narration, picks among several choices per chapter, sets the balance between music and
voice, or swaps the music for an ambient soundscape (rain, fireplace, cityscape). It plays audiobooks the listener
already owns: their downloaded Audible library and local audio files.

From the owner's words (2026-10-22): "Mood read will be an application similar in nature to audible, except it will
use AI to determine playlists of music scores, instrumentals, and ambient pieces based off of the emotions evoked
during certain chapters within the audiobook."

## What exists

Nothing yet. The repository holds a README and this plan; the stack is a cross-platform phone app with the web for
development (Open questions 1, answered). Every chunk below
is new, and no other spec owns any of it.

## What this spec builds

- **The player (01.1):** a library of books, and playback with what an Audible listener expects: play and pause,
  skip back and forward 30 s, chapter list and jump, speed (0.5× to 3×), sleep timer (minutes or end of chapter),
  bookmarks, resume exactly where you stopped, background playback and lock-screen / media-key controls.
- **Your own books (01.6):** import DRM-free files the listener owns (M4B, M4A/AAC, MP3, WAV, FLAC, OGG/Opus), as one
  file or a folder of files that make one book. Chapters come from the file's chapter markers (M4B, MP3 CHAP), else
  one file per chapter, else detected silences, and the listener can rename, merge or split them. Audible downloads
  are AAX/AAXC with Audible's DRM. Mood Read imports only DRM-free files: it recognizes an AAX/AAXC file, declines
  it with a clear import note, and decrypts nothing (Open questions 2, answered (a)).
- **A second audio layer (01.3):** a music bed that plays alongside the narration, follows it (pauses with it, moves
  to the next chapter's pieces when the chapter changes, crossfades between pieces), loops or advances its playlist
  while a chapter runs, and respects the speed setting without pitch-shifting the music.
- **The mixer (01.5):** one balance control between narration and music (plus a master volume), saved per book, and
  an optional "duck under voice" that dips the music while the narrator speaks.
- **Ambient soundscapes (01.7):** a bundled set of seamless loops (at least rain, fireplace, cityscape, forest,
  ocean, café), chosen per book or per chapter instead of the music, through the same layer and mixer.
- **Mood scoring (01.2):** an AI research agent works out what happens in each chapter from what is written about
  the book: chapter summaries (e.g. SparkNotes), reviews and other sources found by searching on the book's title,
  author and chapter titles (Open questions 4). From that it names the emotions each chapter evokes (a small fixed
  set, e.g. tension, sorrow, wonder, joy, dread, calm, romance, triumph, with an intensity) and cites its sources.
  Mood Read then builds a playlist of matching pieces from the music catalog (Open questions 3). The book's audio is
  never transcribed or uploaded. Research chapters are matched to the audiobook's chapters by title and order. A
  book or chapter with too little written about it is marked unscored rather than guessed. Results are stored per
  chapter, so a book is scored once, not on every play.
- **The per-chapter selector (01.4):** each chapter shows its emotions and several scored choices; the listener picks
  one, previews it, or keeps "auto". The pick is saved per chapter and wins over the default.

## Contracts

- **Data:** `Book` (title, author, narrator, cover, source: `local` | `audible`, files, duration, position),
  `Chapter` (book, index, title, start/end within the book's audio), `ChapterMood` (chapter, emotions with
  intensities, sources cited, coverage: `scored` | `too-little`, model and version, scored at), `Piece` (catalog
  id, title, artist, kind: `score` | `instrumental` | `ambient`, mood tags, duration, license), `ChapterPlaylist`
  (chapter, ranked pieces, the listener's pick or `auto`), `Soundscape` (id, name, loop file), `Mix` (book,
  narration level, music level, duck on/off, layer: `music` | `soundscape` | `off`, soundscape id).
- **One audio engine, two layers:** narration and the bed are separate players behind one clock owned by the
  narration, so seek, pause, speed and chapter change drive the bed; the bed never drives the narration.
- **Scoring is a job, not a play-time call:** scoring a book runs once in the background (with progress), and the
  player works without it: an unscored chapter plays narration only, or the book's soundscape.
- **The listener's audio stays theirs:** scoring sends only the book's title, author and chapter titles to the
  research agent; the audio never leaves the device and is never transcribed (Open questions 4). Mood Read keeps the
  agent's findings (emotions and source links), not copies of the sources' text.

## Acceptance

Measure: 19 open · 0 closed · next A20

- **A1** A book in the library plays, pauses, skips ±30 s and jumps to any chapter from the chapter list.
- **A2** Speed runs 0.5× to 3× without pitch change; a sleep timer stops playback after N minutes or at chapter end.
- **A3** Closing and reopening the app resumes the book within 1 s of where it stopped; bookmarks can be added, named
  and jumped to.
- **A4** Playback continues in the background and answers lock-screen / media-key controls.
- **A5** A DRM-free M4B, MP3, M4A, WAV, FLAC or OGG/Opus file, or a folder of them, imports as one book with cover,
  title and author read from its tags.
- **A6** Chapters come from embedded markers, else one per file, else detected silences; the listener can rename,
  merge and split them.
- **A7** Audible-owned books reach the library only as DRM-free files the listener brings (Open questions 2, (a)).
  Picking an AAX/AAXC file shows a clear import note instead of failing silently, Mood Read decrypts nothing, and it
  never asks for or stores an Audible password.
- **A8** Music plays under the narration, pauses and seeks with it, and changes to the next chapter's pieces at the
  chapter boundary with a crossfade.
- **A9** Changing the narration's speed never changes the music's speed or pitch.
- **A10** One balance control and a master volume set narration against music; the setting is saved per book.
- **A11** "Duck under voice" dips the music while the narrator speaks and brings it back in the pauses.
- **A12** At least six ambient soundscapes loop without an audible seam and can replace the music for a book or one
  chapter, through the same mixer.
- **A13** Scoring a book names each chapter's emotions with intensities and stores them; rescoring is explicit.
- **A14** Each scored chapter gets a ranked playlist of at least three pieces whose mood tags match its emotions.
- **A15** Scoring runs in the background with progress and survives the app closing; an unscored chapter still plays.
- **A16** Each chapter's selector shows its emotions and its choices, previews a choice, and saves the pick (or
  `auto`).
- **A17** A saved pick plays for that chapter on every later listen, over the auto choice.
- **A18** Every piece and soundscape Mood Read plays carries a license that allows playing it in the app.
- **A19** Each scored chapter's emotions come from research on the book (summaries, reviews and similar sources),
  cite the sources they came from, and are found without uploading or transcribing the book's audio. A chapter
  with too little written about it is shown as unscored, not given a guessed mood.

## Open questions (owner decisions)

1. **Platform and stack.** *Answered by the owner (2026-10-22):* a cross-platform phone app first (background
   audio and lock-screen controls matter most there), with the web for development. 01.1 builds it as an Expo
   (React Native) app with its web build for development.
2. **Audible books.** *Answered by the owner (2026-10-22): (a)*, with a clear import note; 01.6 builds no
   decryption until the owner picks (b). Audible downloads are AAX/AAXC files locked by Audible's DRM, and Audible
   offers no public API to play them in another app. Removing the DRM, even for a book you own, has legal risk (for
   example the DMCA's anti-circumvention rule in the US). Options were: (a) import only DRM-free files and tell
   listeners to bring their own converted copies; (b) decrypt with the listener's own activation bytes on their
   device; (c) leave Audible out of v1.
3. **Where the music comes from.** *Answered by the owner (2026-10-22):* "I would love to figure out a way to play
   music from spotify, youtube, music, and the royalty free catalog." The question was which source Mood Read may
   legally play under the narration: a licensed royalty-free catalog, a streaming service's API, AI-generated
   music, or a curated set the owner licenses. What the answer means for the build:
   - **Royalty-free catalog: yes, now.** 01.2 builds on a curated royalty-free catalog tagged by mood, and A18 holds.
   - **Spotify: blocked as the developer terms read today.** Spotify's Developer Policy says "Do not permit any
     device or system to segue, mix, re-mix, or overlap any Spotify Content with any other audio content" (III.7).
     That is exactly music under narration. It also limits streaming to Premium users (IV.1) and bars selling a
     streaming app (IV.2).
   - **YouTube: blocked as the developer terms read today.** YouTube's Developer Policies forbid separating or
     modifying a video's audio (III.I.7) and playing from a background player (III.I.9). YouTube Music has no
     public playback API.
   - **"music" (read as Apple Music, or YouTube Music if that was meant): unverified.** MusicKit plays Apple Music
     for subscribers. Whether its terms allow mixing under other audio is not yet checked.
   - 01.9 (below) studies a compliant way to bring these services in, and reports back before any of it is built.
4. **How a chapter is read for its mood.** *Answered by the owner (2026-10-22):* "An AI agent should be able to
   determine the types of emotions a book's chapter would invoke based on the events posted in sites like
   sparknotes, reviews of books, and all other types of research." So scoring researches the book instead of
   reading its audio: no speech-to-text, and the audio never leaves the device. The options were speech-to-text on
   the device or a cloud service over the audio. What 01.2 must handle as a result: books with little written
   about them (marked unscored, A19), and summary chapters that don't line up with the audiobook's chapters. It
   must also read sources through a search tool and stay within each site's terms (no bulk scraping), and keep
   findings and links, not copies of the text.
5. **Accounts and price.** Is Mood Read free, paid once, or a subscription (scoring and music licensing cost money
   per book)? Do listeners have accounts that sync their library and picks across devices? Default if unanswered: no
   accounts in v1, everything local.

## Chunks

Build order (nexus's choice): the player first, since everything plays through it; then real books in it; then the
second audio layer and its mixer; then soundscapes, which give the layer something to play before any AI; then
scoring; then the selector over scoring's choices. Ids keep the order the owner wrote them in.

- **01.1** · L · The player: library view, playback, chapters, speed, sleep timer, bookmarks, resume, background
  and lock-screen controls; opens one local file to have something to play. Closes A1, A2, A3, A4.
  - Open questions 1 is answered: a cross-platform phone app, with the web for development.
- **01.6** · L · Your own books: import DRM-free files and folders, tags and covers, chapter detection and editing,
  and Audible's path as Open questions 2 settled it: (a), a clear import note for AAX/AAXC and no decryption until
  the owner picks (b). Closes A5, A6, A7. Needs 01.1.
- **01.3** · M · Music alongside the audiobook: the second layer on the narration's clock, chapter-boundary
  crossfades, speed-independent bed; plays a fixed test playlist until 01.2 exists. Closes A8, A9. Needs 01.1.
- **01.5** · S · The mixer: balance, master volume, per-book save, duck under voice. Closes A10, A11. Needs 01.3.
- **01.7** · M · Ambient soundscapes: six or more licensed seamless loops, per book or per chapter, through the
  layer and mixer. Closes A12, partial A18. Needs 01.3.
- **01.2** · L · AI mood playlists per chapter: a research agent reads what is written about the book (Open
  questions 4), names each chapter's emotions with intensities and sources, and ranks pieces from the royalty-free
  catalog (Open questions 3), as a background job stored per chapter. Closes A13, A14, A15, A18, A19. Needs 01.3
  and 01.6.
- **01.4** · S · The per-chapter selector: emotions, choices, preview, saved pick over auto. Closes A16, A17.
  Needs 01.2.
- **01.9** · S · Streaming sources study (Open questions 3): check the current terms of Spotify, YouTube / YouTube
  Music and Apple Music for any compliant way to use them in Mood Read. Examples: a licensing deal, music played only
  between chapters rather than under the voice, or the selector linking out to a matching playlist in the
  listener's own app. Report the options and their costs to the owner. Builds nothing and closes no acceptance ID;
  it does not block 01.2.
