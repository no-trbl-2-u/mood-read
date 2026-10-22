# Close 01.1 · the player (branch `chunk-01.1-player`)

Apply on settle to `plan/01-audiobook-player-app-similar-to-audible.md` and `plan/README.md`, then delete this file.

## Open questions 1: default taken

Platform and stack: a cross-platform phone app built with Expo SDK 58 (React Native, Expo Router, expo-audio),
with the web build for development. Record this as settled under Open questions 1 unless the owner objects.

## What exists (replace "Nothing yet")

- An Expo app at the repo root. It has a library screen (import one or more audio files as one book, one chapter
  per file in name order; continue card; progress; remove) and a player screen (play/pause, ±30 s, tap-to-seek
  scrubber per chapter, chapter list and jump, speed, sleep timer, named bookmarks).
- `src/player/PlayerProvider.tsx` is the one narration engine on a book-wide clock (spec Contracts). It
  saves position every 0.5 s, on pause and when backgrounded. 01.3's bed should subscribe to it.
- Storage: book audio is copied into the app's documents folder (IndexedDB on web). Books, positions, bookmarks
  and per-book speed are kept in an SQLite key-value store (localStorage on web).

## Acceptance

- **A1 closed.** Verified on web: play, pause, ±30 s, and chapter jump across files.
- **A3 closed.** Verified on web: after a reload, the book resumed at the exact saved position (87.51 s, chapter 2
  0:12). Bookmarks can be added, named, renamed, deleted and jumped to.
- **A2 stays open, partly met.** On web, speed covers 0.5–3× with pitch preserved (3× measured at ~2.8× real
  time). The end-of-chapter sleep timer stopped at the next chapter's start, and the minutes timer is unit
  tested. Android blocks the rest: expo-audio clamps the rate to 2.0× (`AudioPlayer.kt`), so the app offers 3×
  only on iOS and web. Closing A2 needs one of three things: accept 2× on Android, patch expo-audio, or switch
  the engine (e.g. react-native-track-player).
- **A4 stays open, built but unverified.** The config plugin enables background playback (Android foreground
  service, iOS `audio` mode). The audio mode is `doNotMix` with `shouldPlayInBackground`. Lock-screen controls
  show ±30 s seek. Web media-session metadata was confirmed. It still needs a check in a development build on a
  real phone. Known limits: lock-screen seek stays within the current file, and expo-audio sends no
  next/previous-track events.

Measure: 18 open · 0 closed → 16 open · 2 closed · next A19.

## Chunks

Remove 01.1. Add a follow-up so A2 and A4 are not lost:

- **01.8** · S · Device pass for the player: run a development build on iOS and Android, confirm background
  playback and lock-screen/media-key controls, and settle Android's 2× speed cap. Closes A2, A4. Needs 01.1.

The README row's progress goes to 7 left (01.1 out, 01.8 in), and the status notes that Open questions 1 took
its default.
