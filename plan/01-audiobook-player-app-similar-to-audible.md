# 01 · Mood Read: an audiobook player that scores each chapter

**Why:** Mood Read is an audiobook app in the spirit of Audible. Its twist is that every chapter comes with music:
AI reads the emotions a chapter evokes and picks scores, instrumentals and ambient pieces to match. The listener
hears that music under the narration, picks among several choices per chapter, sets the balance between music and
voice, or swaps the music for an ambient soundscape (rain, fireplace, cityscape). It plays audiobooks the listener
already owns as DRM-free audio files on their device (from a store like Libro.fm, or public domain); Audible's own
downloads stay locked, and a companion mode can play beside the Audible app instead (`docs/workarounds.md`).

From the owner's words (2026-10-22): "Mood read will be an application similar in nature to audible, except it will
use AI to determine playlists of music scores, instrumentals, and ambient pieces based off of the emotions evoked
during certain chapters within the audiobook."

## What exists

Verified 2026-10-22: main holds the README, this plan and the nexus overlay, and no app code. The stack is a
cross-platform phone app with the web for development (Open questions 1, answered); spec 02 builds the app shell and
its gates. A first build of 01.1 sits on the local branch `chunk-01.1-player` (never pushed). No other spec owns
any of the chunks below.

## v1 MVP: two parts

From the owner (2026-10-22): v1 is two parts. (1) "A mobile app player where I can play my audiobooks, as well as,
some ambient soundscapes and a mixer." (2) "A system in which we create the playlists for the chapters based on
moods (we'd loop the score/piece, so one song / one chapter). I know we have a licensing issue, so for now, we can
just name the pieces/scores/songs/instrumentals (It's important that there's no vocals)."

- **Part 1, the player:** play your own audiobooks, with an ambient soundscape under the narration and a mixer.
  Chunks 01.1, 01.6, 01.3, 01.5, 01.7.
- **Part 2, chapter moods with named pieces:** research each chapter's moods and name one piece for it (a score,
  instrumental or ambient piece, never with vocals) that would loop for the whole chapter: one piece, one
  chapter. Because of licensing, v1 names the pieces and plays none of them. Chunks 01.2, 01.4.
- **After v1:** playing the named pieces under the narration, from a licensed source (01.10), informed by the
  streaming study (01.9).

## What this spec builds

- **The player (01.1):** a library of books, and playback with what an Audible listener expects: play and pause,
  skip back and forward 30 s, chapter list and jump, speed (0.5× to 3×), sleep timer (minutes or end of chapter),
  bookmarks, resume exactly where you stopped, background playback and lock-screen / media-key controls.
- **Your own books (01.6):** import DRM-free files the listener owns (M4B, M4A/AAC, MP3, WAV, FLAC, OGG/Opus), as one
  file or a folder of files that make one book. Chapters come from the file's chapter markers (M4B, MP3 CHAP), else
  one file per chapter, else detected silences, and the listener can rename, merge or split them. Audible downloads
  are AAX/AAXC with Audible's DRM. Mood Read imports only DRM-free files: it recognizes an AAX/AAXC file, declines
  it with a clear import note, and decrypts nothing. v1 has no Audible integration at all: no Audible sign-in and no
  library sync (Open questions 2, answered (a) and (c)).
- **A second audio layer (01.3):** a bed that plays alongside the narration and follows it: it pauses and seeks with
  it, changes with a crossfade when the chapter changes, loops while a chapter runs, and ignores the narration's
  speed, so the bed is never sped up or pitch-shifted. In v1 it carries soundscapes; after v1 it also plays the
  chapter's piece (01.10).
- **The mixer (01.5):** one balance control between narration and the bed (plus a master volume), saved per book,
  and an optional "duck under voice" that dips the bed while the narrator speaks.
- **Ambient soundscapes (01.7):** a bundled set of seamless loops (Rain, Hearth Fire, Night Wind, Tide, Static
  Hush, Low Café, synthesized by `scripts/make-soundscapes.mjs` and owned by the project), chosen per book or per
  chapter, through the same layer and mixer.
- **Mood scoring (01.2):** an AI research agent works out what happens in each chapter from what is written about
  the book: chapter summaries (e.g. SparkNotes), reviews and other sources found by searching on the book's title,
  author and chapter titles (Open questions 4). From that it names the emotions each chapter evokes (a small fixed
  set, e.g. tension, sorrow, wonder, joy, dread, calm, romance, triumph, with an intensity) and cites its sources.
  Then it names one piece for the chapter that fits those emotions, plus two or more alternates. Each is a film
  or game score, instrumental or ambient piece with no vocals, given by title, composer or artist, and kind. The
  piece is meant to loop for the whole chapter. In v1 pieces are named, not played (licensing). The book's audio is
  never transcribed or uploaded. Research chapters are matched to the audiobook's chapters by title and order. A
  book or chapter with too little written about it is marked unscored rather than guessed. Results are stored per
  chapter, so a book is scored once, not on every play.
- **The chapter mood card (01.4):** each chapter shows its emotions, its named piece and the alternates. The listener
  can pick an alternate or keep "auto", and the pick is saved per chapter. Nothing is previewed or played in v1.
  The card never shows events, and shows a chapter's emotions only once the listener reaches it (Open questions 7).
- **Playing the chapter's piece (01.10, after v1):** the chapter's piece (the pick, else auto) loops under the
  narration through the layer and mixer, from a source licensed to play it (Open questions 3).

## Contracts

- **Data:** `Book` (title, author, narrator, cover, files, duration, position),
  `Chapter` (book, index, title, start/end within the book's audio), `ChapterMood` (chapter, emotions with
  intensities, sources cited, coverage: `scored` | `too-little`, model and version, scored at), `Piece` (id,
  title, composer or artist, kind: `score` | `instrumental` | `ambient`, vocals: always `none`, mood tags; a played
  piece is a `CatalogPiece`, spec 05), `ChapterPlaylist` (chapter, one named piece that loops for
  the chapter, two or more alternates, the listener's pick or `auto`), `Soundscape` (id, name, loop file), `Mix`
  (book, balance and master volume, from which the narration and bed levels follow, duck on/off, layer:
  `soundscape` | `music` (from 01.10) | `off`, soundscape id).
- **One audio engine, two layers:** narration and the bed are separate players behind one clock owned by the
  narration, so seek, pause, speed and chapter change drive the bed; the bed never drives the narration.
- **Scoring is a job, not a play-time call:** scoring a book runs once in the background (with progress), and the
  player works without it: an unscored chapter plays narration only, or the book's soundscape.
- **The listener's audio stays theirs:** scoring sends only the book's title, author and chapter titles to the
  research agent; the audio never leaves the device and is never transcribed (Open questions 4). Mood Read keeps the
  agent's findings (emotions and source links), not copies of the sources' text, and never the chapter's events
  (Open questions 7).
- **The scoring proxy (Open questions 6):** the app's only server. It holds the AI and search keys, receives only
  title, author and chapter titles, enforces a monthly spend cap, and caches each book's result for every listener.
  It keeps no listener data.

## Acceptance

- **A24** Each chapter's mood card links out to its reference piece ("In the spirit of") on Spotify, YouTube /
  YouTube Music and Apple Music, and Mood Read plays none of it; a listener can save a book's reference pieces as
  a playlist in their own YouTube or Apple Music account.
- **A33** Scoring a real book on mood-read.pages.dev returns researched chapter moods and named pieces
  from the deployed proxy, with spend metered at OpenAI's and Brave's current prices.
- **A39** The deployed proxy pre-scores through a GitHub Actions job: `prescore.yml` runs
  `pnpm prescore` daily and on demand with `PRESCORE_TOKEN` as a repository secret, keeps its ledger across runs,
  and one test run scores real LibriVox books that Browse then reads as Scored.
- **A41** On Android the duck-under-voice switch really dips the bed while the narration speaks, by a path that
  needs no microphone permission, checked on a phone.
- **A40** The average cost of one scoring run is known from the meter's own spend over real runs, the
  meter's prices match OpenAI's and Brave's current rates, and whether Brave is needed is decided by scoring the
  same books with and without it.

## Owner decisions (all answered)

Every question below is answered; none is open. Elsewhere in the plan, "Open questions N" means item N here.

1. **Platform and stack.** *Answered by the owner (2026-10-22):* a cross-platform phone app first (background
   audio and lock-screen controls matter most there), with the web for development. 01.1 builds it as an Expo
   (React Native) app with its web build for development.
2. **Audible books.** *Answered by the owner (2026-10-22): (a) and (c)*: DRM-free files only, with a clear import
   note, and no Audible integration in v1 (no sign-in, no library sync, no decryption). Audible downloads are
   AAX/AAXC files locked by Audible's DRM, and Audible offers no public API to play them in another app. Removing
   the DRM, even for a book you own, has legal risk (for example the DMCA's anti-circumvention rule in the US).
   Options were: (a) import only DRM-free files and tell listeners to bring their own converted copies; (b) decrypt
   with the listener's own activation bytes on their device; (c) leave Audible out of v1. *Revised 2026-10-23
   (01.13):* Audible's Conditions of Use forbid the listener circumventing its DRM too (Content Restrictions (iv)),
   so Mood Read never suggests converting; the AAX/AAXC note points to DRM-free stores and companion mode
   (`docs/workarounds.md`).
3. **Where the music comes from.** *Answered by the owner (2026-10-22):* "I would love to figure out a way to play
   music from spotify, youtube, music, and the royalty free catalog." The question was which source Mood Read may
   legally play under the narration: a licensed royalty-free catalog, a streaming service's API, AI-generated
   music, or a curated set the owner licenses. The owner refined it the same day: "By default, the free ambient
   soundscapes and royalty-free catalog. But if the user has connected a paid youtube account and/or a connected
   paid spotify account it would come from there." So the default needs no connection, and a connected paid account
   is the goal for when the services allow it. What the answer means for the build:
   - **Royalty-free catalog: the default once pieces play (01.10).** The owner's v1 scope (2026-10-22) names
     pieces without playing them, so 01.2 needs no catalog. A18 holds for everything played (soundscapes in v1). A
     named piece may have no licensed recording, so 01.10 plays the closest licensed match with no vocals.
   - **Spotify: blocked as the developer terms read today.** Spotify's Developer Policy says "Do not permit any
     device or system to segue, mix, re-mix, or overlap any Spotify Content with any other audio content" (III.7).
     That is exactly music under narration. It also limits streaming to Premium users (IV.1) and bars selling a
     streaming app (IV.2).
   - **YouTube: blocked as the developer terms read today.** YouTube's Developer Policies forbid separating or
     modifying a video's audio (III.I.7) and playing from a background player (III.I.9). YouTube Music has no
     public playback API.
   - **Apple Music: blocked as its terms read today** (checked 2026-10-23). MusicKit content "cannot be
     synchronized with any other content" (Apple Developer Program License Agreement 3.3.6(D)), and a song at a
     set moment needs the rights-holders' sync license (App Review Guidelines 4.5.2(ii)).
   - **The study (01.9, `docs/streaming-sources.md`, 2026-10-23):** no service allows its music under the
     narration, and a listener's paid account changes nothing. Every service allows a link out from the mood card;
     Apple Music and YouTube allow saving a playlist to the listener's account, and Spotify allows it only past its
     5-user development quota. The royalty-free catalog stays the only source played under the voice.
   - **SoundCloud (01.12, the same report, 2026-10-23):** its API may not play a track under the narration or
     between chapters without SoundCloud's written approval, offers nothing offline, and opens nothing for Go or
     Go+ listeners; a soundcloud.com link-out is free. Hand-picked CC-BY, CC-BY-SA or confirmed-CC0 tracks, fetched
     outside the API and checked one by one (authorship, license version, no vocals), may join the bundled catalog
     with full credit; NC, ND and all-rights-reserved tracks never do.
4. **How a chapter is read for its mood.** *Answered by the owner (2026-10-22):* "An AI agent should be able to
   determine the types of emotions a book's chapter would invoke based on the events posted in sites like
   sparknotes, reviews of books, and all other types of research." So scoring researches the book instead of
   reading its audio: no speech-to-text, and the audio never leaves the device. The options were speech-to-text on
   the device or a cloud service over the audio. What 01.2 must handle as a result: books with little written
   about them (marked unscored, A19), and summary chapters that don't line up with the audiobook's chapters. It
   must also read sources through a search tool and stay within each site's terms (no bulk scraping), and keep
   findings and links, not copies of the text.
5. **Accounts and price.** *Answered by the owner (2026-10-22):* "Mood Read would be free, but it would help if the
   user has a paid spotify account and a paid youtube account to help us with the music licensing. But v1,
   everything local." So:
   - **Free.** Listeners pay nothing. A free app is also the only kind Spotify allows to stream (its Developer
     Policy bars selling a streaming app, IV.2).
   - **v1 is everything local:** no Mood Read accounts and no sync. The library, positions, bookmarks, moods and
     picks live on the device.
   - **Listeners' paid Spotify and YouTube accounts are welcome but don't settle licensing.** Spotify requires
     Premium to stream (IV.1), but its no-mixing rule (III.7) applies whatever the listener pays. YouTube Premium's
     background play exists only in YouTube's own apps, not through its API. 01.9 checks whether a listener's own
     subscription opens any compliant path.
   - **Open cost note.** Research-agent scoring (01.2) costs model and search fees per book, and with a free app
     the owner pays them. 01.2 should score each book once (already in A13), cache the result on the device and on
     the proxy (Open questions 6), and report the cost per book so the owner can see it.
6. **Where the research agent's AI key lives.** The agent needs an AI model and web search, and a key shipped
   inside the app can be pulled out and spent by anyone. So "everything local" needs one exception: a small server
   that holds the key. *Answered by the owner (2026-10-22):* "a thin serverless proxy that receives only a book's
   title, author and chapter titles, enforces a monthly spend cap, and caches each book's moods so every listener
   of that book shares one research run." So:
   - **The key never ships in the app.** The app calls the proxy, and only the proxy holds the AI and search keys.
   - **The proxy receives only title, author and chapter titles** and holds no listener data: no accounts, no
     device IDs kept, no positions or picks.
   - **A monthly spend cap.** Past the cap, new books wait as unscored until the next month; already-cached books
     still return. Chapters still play (A15).
   - **One research run per book, shared.** The proxy caches each book's moods and pieces, so a second listener of
     the same book gets the cached result at no new cost. The app also keeps its copy on the device.
   - **Provider and cap.** *Answered by the owner (2026-10-23):* OpenAI for the model and Brave Search for search
     (the vault's `OPENAI_API_KEY` and `BRAVE_SEARCH_API_KEY`), and a monthly cap of $20, held as one config value
     on the proxy so it changes without a rebuild.
7. **Spoilers.** The agent learns each chapter's events, and even a mood can hint at them ("dread" in chapter 30).
   *Answered by the owner (2026-10-22):* "Mood Read never shows events, only emotions, and the mood card shows a
   chapter's emotions only once the listener reaches it." So the app stores and shows emotions, intensities, source
   links and pieces, never the agent's notes on what happens; and a chapter the listener hasn't reached yet shows
   no emotions on its card (A21).

## Chunks
Measure: 5 open · 37 closed · next A43

Build order follows the owner's two-part v1, and the lines below are in that order. **Part 1, the player:** 01.1,
01.6, 01.3, 01.5, 01.7: the player, then real books in it, then the second layer, its mixer and the soundscapes it
plays. **Part 2, moods and named pieces:** 01.2, then 01.4. **After v1:** 01.9 (a study), then 01.10 (play the
pieces). Ids keep the order they were written in. The app itself (Expo at the repo root, the gates) is spec 02.

- [ ] **01.11** Mood-card link-outs and playlist saving · M · closes A24 · needs —
  - The links go to the chapter's reference piece: the famous no-vocals piece shown only as "In the spirit of"
    beside the catalog pick (D13). Mood Read never plays it.
  - As `docs/streaming-sources.md` sets them: each service's branding rules; Spotify gets plain links only (its
    Developer Policy III.5, until the owner revisits it after v1); YouTube playlists through the Data API within
    its daily quota; Apple Music playlists only once the Apple Developer Program is joined (after v1); SoundCloud
    gets a plain soundcloud.com link, no API.
- [ ] **01.20** Turn scoring on: set the app's proxy URL · S ·
  closes A33 · needs 01.27
  - The owner chose (2026-10-24, D33) to go live on OpenAI and Brave as 01.2 built the proxy; the move to Claude
    (D15) is dropped.
  - The proxy is already deployed and pre-scoring tested (the prescore-job chunk) and the run cost known (the
    run-cost chunk); this step points the app at it: `expo.extra.scoringProxyUrl` in `app.json` set to the
    Worker's URL (the placeholder resolves nowhere), then score one real book end to end on mood-read.pages.dev.
- [ ] **01.26** Pre-scoring as a GitHub Actions job, tested on the deployed proxy · S ·
  closes A39 · needs —
  - The owner chose (2026-10-25) to test pre-scoring through the GitHub job first, before the app points at the
    proxy. The proxy deploy moves here from 01.20: `pnpm secrets:sync` through the vault, then
    `wrangler deploy --config proxy/wrangler.jsonc` (creates `BookJob`, `SpendMeter`, `PrescoreIndex` and
    `RateLimiter`); the app's `scoringProxyUrl` stays the placeholder, so no listener reaches it yet.
  - `.github/workflows/prescore.yml`: `workflow_dispatch` (with a `limit` input) and a daily schedule; it runs
    `pnpm prescore` with `PRESCORE_TOKEN` from repository secrets (`node scripts/secrets.mjs push PRESCORE_TOKEN
    --to github-actions`) and the proxy's URL as a repository variable, and restores and saves
    `.nexus/prescore-ledger.json` through `actions/cache` so the daily ceiling and done set hold across runs.
  - The test: `pnpm prescore --dry-run` locally, then one dispatch with `limit: 3`; check archive.org's search
    returns `call_number` (or Browse rows never read Scored) and that `GET /v1/prescored` lists the three books.
- [ ] **01.27** What one scoring run costs, and whether Brave is needed · S · closes A40 ·
  needs 01.26
  - Read the meter's spend over the test runs and give the average per book and per chapter; check
    `proxy/src/meter.ts`'s prices (gpt-5-mini at $0.25 / $2 per million tokens, Brave at $0.005 a query) against
    the providers' current rates.
  - Score the same few books with OpenAI's own web search in place of Brave (a proxy setting, not a second
    deploy) and compare the moods, the named pieces and the cost; record the choice as a decision, and if Brave
    goes, drop `BRAVE_SEARCH_API_KEY` from the secrets list.
- [ ] **01.28** Duck under voice on Android, with no microphone permission · M · closes A41 · needs —
  - Low priority (the owner, 2026-10-26): not worth building until better soundscapes and music exist; the loop
    picks it last.
  - Today expo-audio samples the narration for ducking only with RECORD_AUDIO, and Mood Read asks for no
    microphone, so Android's duck is a no-op (iOS samples through expo-audio's tap, untested on a device). Find a
    path with no microphone prompt (for example a ducking cue from the narration's own position or loudness data,
    or the audio focus APIs), then check it on the preview APK.
