# Mood Read — spec

> an audiobook player that scores each chapter.

One page. The full v1 spec, with every owner decision and its date, is
[`plan/01-audiobook-player-app-similar-to-audible.md`](plan/01-audiobook-player-app-similar-to-audible.md); when the
two disagree, that file wins and this one is fixed.

## Product

An audiobook app in the spirit of Audible whose twist is music. AI reads what is written about a book (chapter
summaries, reviews) to work out the emotions each chapter evokes, and names a no-vocals piece (a score, instrumental
or ambient piece) to loop under that chapter. The listener hears an ambient soundscape under the narration in v1, and
the named piece once a licensed source exists.

From the owner (2026-10-22): "Mood read will be an application similar in nature to audible, except it will use AI to
determine playlists of music scores, instrumentals, and ambient pieces based off of the emotions evoked during
certain chapters within the audiobook."

## Audience

People who own audiobooks as DRM-free files (from stores like Libro.fm, or public domain) and want atmosphere
under the narration, on their phone.

## Scope

- **v1, part 1, the player:** a library of the listener's own books (M4B, M4A/AAC, MP3, WAV, FLAC, OGG/Opus) with
  Audible-grade playback (skip ±30 s, chapters, speed 0.5× to 3×, sleep timer, bookmarks, resume, background and
  lock-screen controls), a second audio layer under the narration, a mixer with duck under voice, and at least six
  ambient soundscapes.
- **v1, part 2, moods and named pieces:** each chapter's emotions researched by an AI agent through a small proxy
  that holds the key, caps spend and caches each book; one named no-vocals piece per chapter plus alternates, shown
  on a mood card, named but not played.
- **After v1:** a study of Spotify, YouTube and Apple Music terms, then playing the chosen piece from a licensed
  source, the royalty-free catalog by default.

## Stack

A cross-platform phone app (Expo, React Native, TypeScript) with its web build for development, deployed to
Cloudflare Pages. Details: [`plan/bearings.md`](plan/bearings.md).

## Contracts

The app's routes (`/` the library, `/book/[id]` a book's player), the on-device data shapes in spec 01's Contracts,
and the proxy's promise: it receives only a book's title, author and chapter titles, and keeps no listener data.

## Non-goals

- Decrypting Audible's AAX/AAXC files, an Audible sign-in, or library sync.
- Uploading or transcribing the listener's audio.
- Accounts, sync, social features or payments: Mood Read is free and local in v1.
- Showing a chapter's events, or a chapter's emotions before the listener reaches it.
- Any piece with vocals, or any audio played without a license that allows it.
