# 05 · Mood Read v2: free books to browse, a music catalog, and one-button chapter playlists

> A listener browses and downloads free public-domain audiobooks (LibriVox), manages what is on the device, and
> with one button builds a book's playlist from Mood Read's royalty-free catalog: one piece per chapter, all
> downloaded ahead, so they can start at any chapter offline. Mood Read reaches the Play Store and the App Store.

Agent-facing spec. Every judgment call is made below; a build that meets a new one decides it and records it in the
commit body.

## Why

From the owner (2026-10-23), what v2 is: "An actual 'browse/search' section where people can download (to listen
to) royalty free audiobooks (ie. libravox)"; "a library where people can manage their audiobooks (and give them the
ability to delete the downloaded file, but keep the book in their library)"; "a knowledge base of royalty-free music
ready for the application to download"; and the mood reader with "a single button to build a playlist from all of
the available music", pieces "locked to chapters so the playlist doesn't move to the next piece before the user is
done listening to their chapter", a button that "should pre-download the pieces so the user can jump in at any
chapter", and deleting a book deletes its pieces "unless the piece is a part of another book's playlist that has
not been deleted yet". The owner also took five additions the same day: a download manager, scoring public-domain
books from their own text, native app-store builds, moods shown while browsing, and a credits section kept "a little
off to the side so it's not in the way". On the piece source: "Catalog only here. But there should be an option to
build a spotify playlist (for each chapter, where the playlist is the length of time for the chapter. For
audiobooks that unabridged, we'd have to pre-slice the audio file so that we can create individual chapter files)".

What exists, verified 2026-10-23: main holds the app shell (02.1) and no player yet. Spec 01 plans the v1 library
(01.1), DRM-free imports (01.6), mood scoring with named pieces (01.2), the mood card (01.4), catalog playback
looped per chapter (01.10, after v1), link-outs and playlist saving (01.11) and a workarounds study (01.13). Spec
04 plans Android preview APKs. v2 builds on all of them and redoes none: 01.10 already loops one piece per chapter
from the catalog, so "locked to chapters" is 01.10's behaviour, and this spec adds the catalog itself, the button,
the downloads and the deletion rules.

## Design

- **The music catalog (05.1, 05.2).** A manifest of pieces hosted on Cloudflare R2 (the vault's
  `CLOUDFLARE_S3_*` and `S3_API_ENDPOINT`), served read-only to the app as one versioned `catalog.json` plus one
  audio file per piece (AAC or Opus, loop-ready). Each entry is a spec 01 `Piece` plus: source URL, license
  (`cc0` | `public-domain` | `cc-by` | `cc-by-sa`, with version), the credit line the license asks for, the
  rights-checker's verdict and date, duration, loop points, file size and hash. NC, ND and all-rights-reserved
  never enter (D7). A piece enters only through `pnpm catalog:add`, which runs the `rights-checker` sub-agent and
  refuses anything but a `yes` with vocals `none` (agents.md rule 6, A18, A20). The seed set covers every emotion
  in 01.2's fixed set at low and high intensity, with several pieces each, so no scored chapter lacks a match.
- **The scorer picks from the catalog (05.3).** From v2, 01.2's research agent names each chapter's piece and its
  alternates by catalog id only, so the piece the card names is the piece that plays. Books scored before v2 are
  re-matched against the catalog from their stored emotions, with no new research run. The mood card shows the
  piece's title, artist and license. Beside the catalog pick the scorer keeps one famous no-vocals piece per
  chapter as a reference, shown only as "In the spirit of" with 01.11's link-outs and never played
  (D13).
- **One button, one playlist (05.4).** "Build playlist" on a scored book takes each chapter's pick (else auto),
  queues every piece for download, and shows progress. Once done the book plays offline from any chapter: each
  chapter's piece loops for that chapter only (01.10) and changes only at the chapter boundary. Changing a pick
  downloads the new piece and releases the old one. An unscored chapter plays narration with the book's
  soundscape, as in v1.
- **The download manager (05.6).** One queue for books and pieces: progress, pause, resume, retry with backoff, a
  Wi-Fi-only setting (on by default), and a storage meter splitting books from music. Downloads continue in the
  background on native builds; the web build downloads in the foreground only.
- **Library management (05.7).** A book's row offers "Remove download": the file goes, and the book stays with its
  position, bookmarks, moods, picks and mix, marked "Not on device". A LibriVox book downloads again in one tap; an
  imported book asks for its file again and matches it by title, author and duration. "Delete book" removes it
  fully. Either way, a piece's file is deleted only when no other book still on the device has it in its playlist.
- **Browse (05.8).** A Browse screen pushed from the library (the two-level stack stays; no tab bar): search
  LibriVox by title, author or genre through its public API, see a book's readers, length and chapters, and
  download it. The book joins the library as an import does (01.6), with its sections as chapters. The
  `rights-checker` confirms LibriVox's terms (public-domain recordings, archive.org hosting) before 05.8 ships.
- **Scoring from the text (05.9).** For a book from Browse whose text is public domain and on Project Gutenberg,
  the proxy reads the text itself and scores each chapter from it, instead of searching summaries and reviews.
  The app sends the public catalog ids (LibriVox and Gutenberg) beside title, author and chapter titles; never the
  audio. The proxy keeps emotions and links, never the text. Spoiler rules hold (A21).
- **Moods while browsing (05.10).** The owner runs `pnpm prescore` to score the most-downloaded LibriVox books
  ahead of time into the proxy's shared cache, within half of the monthly cap. Browse shows a scored book's
  overall emotions (the book's, never a chapter's) and "Scored" on its row.
- **Credits (05.5).** A Credits screen reached from the library's overflow menu, out of the way of listening:
  every catalog piece with its title, artist, license and source link, the soundscapes, LibriVox's readers for
  each downloaded book, and the app's open-source notices.
- **Chapter files (05.11).** A book that arrives as one long file (a LibriVox M4B or MP3 that holds the whole book) can be split on the
  device into one file per chapter, losslessly where the format allows, keeping the book's chapters, position and
  bookmarks. Native builds only. Nothing leaves the device.
- **Spotify chapter playlists (05.12, 05.13).** An option on a scored book: connect Spotify, and Mood Read creates
  one playlist per chapter in the listener's own account, of instrumental tracks matching the chapter's emotions,
  whose length covers the chapter's duration. The listener plays it in Spotify's own app; Mood Read plays none of
  it. 05.12 gets the `rights-checker`'s verdict first (Developer Policy III.5 and III.7, and 01.13's companion
  mode); `unclear` holds 05.13. Spotify's development mode allows 5 users, so until extended quota (a registered
  business with 250k monthly users, `docs/streaming-sources.md`) this serves the owner and four testers.
- **The stores (05.14, 05.15).** A Google Play release from spec 04's EAS setup, then iOS through TestFlight and the
  App Store once the owner joins the Apple Developer Program (D6: after v1).

Decisions made upfront (do not ask):

- Browse searches LibriVox only in v2; other free catalogs are a later spec.
- Wi-Fi-only downloads are on by default.
- Pre-scoring never spends more than half of the monthly cap; listeners' own books keep the other half.
- A piece is shared, never copied: one file on the device, however many books use it.
- Credits live in the library's overflow menu, never on the player or the river.

- **The web build streams; phones keep (05.6, 05.8).** Browsers cap what a site may store, so the web build keeps
  at most one book and its pieces offline and says so in Downloads; full offline libraries are for the phone
  builds.
- **The library grows up (05.16).** A book can be marked finished (and is when its last chapter
  ends); the library sorts by recent, title or author and filters to in progress, not started or finished, with a
  search field once it holds more than ten books.
- **Backup (05.17).** "Export library" writes one file (books' metadata, positions, bookmarks, moods, picks,
  mixes; never audio) to the device's share sheet; "Import library" reads it back and matches books by title,
  author and duration.
- **In the car (05.18).** Android Auto, then CarPlay once the Apple Developer Program is joined: the library and
  the playing book's chapters as a browsable list, with transport; the bed and its mix play as on the phone.

## Contracts

- **Routes (new):** `/browse` (search and results), `/browse/[id]` (one LibriVox book; `[id]` is its LibriVox id),
  `/credits`, `/downloads` (the queue and the storage meter).
- **Data (new or extended):** `CatalogPiece` (spec 01's `Piece` plus source, license, credit, verdict, loop points,
  size, hash); `Book.source` (`import` | `librivox`, with its LibriVox and Gutenberg ids); `Book.onDevice`
  (true | false); `Download` (target book or piece, state `queued` | `running` | `paused` | `failed` | `done`,
  bytes, error); `ChapterPlaylist.pieceId` holds a catalog id.
- **Scripts:** `pnpm catalog:add <url>` (owner only, through the `rights-checker`), `pnpm prescore` (owner only).
- **Scoring proxy:** from 05.9 it also receives a book's public LibriVox and Gutenberg ids, and nothing else new.

## Acceptance

- **A2** The catalog covers every emotion in the scorer's fixed set at low and high intensity, with at least three
  pieces each.
- **A3** Every piece the scorer names, as the main piece or an alternate, is a catalog piece; a book scored before
  v2 is re-matched without a new research run.
- **A4** One "Build playlist" press downloads every chapter's piece with progress; afterwards the book plays offline
  from any chapter, each chapter's piece looping until that chapter ends.
- **A5** Changing a chapter's pick downloads the new piece and releases the old one.
- **A7** "Remove download" deletes a book's file and keeps the book, its position, bookmarks, moods, picks and mix;
  a LibriVox book downloads again in one tap, an imported one asks for its file again.
- **A8** Removing or deleting a book deletes each of its pieces unless another book still on the device has that
  piece in its playlist.
- **A13** A book in one long file can be split on the device into one file per chapter, keeping its chapters,
  position and bookmarks.
- **A15** With a `yes` verdict, a connected Spotify account gets one playlist per chapter of instrumental tracks
  matching its emotions, at least as long as the chapter; Mood Read plays none of it.
- **A16** Mood Read is published on Google Play.
- **A17** Mood Read is on TestFlight and published on the App Store.
- **A18** A book can be marked finished, and is when its last chapter ends; the library sorts by recent,
  title or author, filters by state, and searches once it holds more than ten books.
- **A19** "Export library" writes one file with no audio in it, and "Import library" restores positions,
  bookmarks, moods, picks and mixes onto matching books.
- **A20** Mood Read appears in Android Auto (and in CarPlay once iOS ships) with its library, chapters and
  transport.
- **A21** The catalog bucket exists and serves `catalog.json` and its pieces read-only to
  mood-read.pages.dev, and the app reads it from `expo.extra.catalogBaseUrl`.

## Open questions

All answered; none is open.

- **Why chapter files?** Mood Read's player already plays chapter by chapter from markers in a single file
  (01.6). *Answered by the owner (2026-10-23):* the split is for LibriVox books that come as one file holding the
  whole book ("unabridged" meant that): a five-hour file can't take one piece per chapter, so 05.11 splits it
  into one file per chapter.
- **Instrumental tracks on Spotify.** Spotify's API offers no instrumental flag to new apps. *Answered by the
  owner (2026-10-23):* the scorer names tracks it judges instrumental, each checked before it joins a playlist; a
  track it can't confirm is left out. The owner left this to the loop (2026-10-23), which kept it: A20 forbids
  vocals, and leaving out what can't be confirmed is the one rule that can't break it.
- **Play Store developer account.** Google's one-time fee and an account in the owner's name. *Answered by the
  owner (2026-10-23):* not now: Mood Read stays the owner's own preview APK (spec 04), so 05.14
  and 05.15 wait in the Held lane.

## Chunks
Measure: 14 open · 8 closed · next A23

- [ ] **05.2** Seed the catalog across every emotion and intensity · L · closes A2 · needs 05.19
  - Sources the 01.13 study ranks, and D7's hand-picked CC-BY / CC-BY-SA tracks; every one through `catalog:add`.
- [ ] **05.3** The scorer names catalog pieces only, and re-matches books scored before v2 · M · closes A3 ·
  needs 05.2
- [ ] **05.4** One button builds and pre-downloads a book's playlist · M · closes A4, A5 · needs 01.10, 05.3
- [ ] **05.7** Library management: remove a download, keep the book; shared pieces survive deletion · M ·
  closes A7, A8 · needs 05.4
- [ ] **05.11** Split a one-file book into chapter files on the device · M · closes A13 · needs 04.1
- [ ] **05.13** Spotify chapter playlists, sized to each chapter · M · closes A15 · needs 01.11, 05.3
  - Rewrite the privacy policy's Spotify section (`src/app/privacy.tsx`) to say what a connected account shares.
  - Replace Settings' disabled "Spotify, Not available yet" row (06.3, `src/app/settings.tsx`) with connect and
    disconnect.
- [ ] **05.14** Google Play release · M · closes A16 · needs 04.1 · secrets EXPO_TOKEN
- [ ] **05.15** TestFlight and the App Store · M · closes A17 · needs 05.14 · secrets EXPO_TOKEN
  - Needs the owner in the Apple Developer Program (D6, `plan/AUDIT.md`).
- [ ] **05.16** Finished books, sort, filter and search in the library · S · closes A18 ·
  needs 05.7
- [ ] **05.17** Export and import the library, never the audio · S · closes A19 · needs 05.7
- [ ] **05.18** Android Auto, then CarPlay · M · closes A20 · needs 05.14
  - Android Auto lists only apps from Google Play, so this waits on 05.14 (held); CarPlay waits on 05.15.
- [ ] **05.19** Turn the catalog on: the R2 bucket, public read and the app's catalog URL · S ·
  closes A21 · needs — · secrets CLOUDFLARE_S3_ACCESS_KEY_ID, CLOUDFLARE_S3_SECRET_ACCESS_KEY, S3_API_ENDPOINT
  - The owner's production step 05.1 left (`docs/catalog.md`): bucket `mood-read-catalog`, an R2 token with
    Object Read and Write on it, public read (r2.dev or a custom domain) with a CORS GET rule for
    `https://mood-read.pages.dev`, then `expo.extra.catalogBaseUrl` in `app.json` (and the placeholder assertion
    in `src/lib/catalog-api.test.ts`).
  - Name `pnpm catalog:add` and the bucket in `plan/bearings.md`, and give `S3_API_ENDPOINT` and
    `CLOUDFLARE_S3_SECRET_ACCESS_KEY` real descriptions in `nexus.secrets.json`.
