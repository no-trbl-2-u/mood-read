# Mood Read roadmap

Mood Read is an audiobook player in the spirit of Audible that scores each chapter: AI picks music and ambient
pieces for the emotions a chapter evokes, and the listener hears them under the narration. This folder holds the
plan: one file per initiative, written before the code, kept current as we build, and deleted when done.

## Sessions

`/next` works through this table: it picks the next chunk whose needs are done (the Asap lane first, then numbered
priorities, then table order), builds it, and removes it. `/plot` puts a task into the plan with its place in line.

**Asap lane** (`/plot asap`): none yet.

| # | Initiative | Spec | Status | Progress |
|---|---|---|---|---|
| 1 | Mood Read: an audiobook player like Audible (01.1), your own books from local files and Audible's path (01.6), music under the narration (01.3) with a mixer (01.5), ambient soundscapes instead of music (01.7), AI mood playlists per chapter (01.2) and a per-chapter selector (01.4) | [01-audiobook-player-app-similar-to-audible.md](01-audiobook-player-app-similar-to-audible.md) | planned (**priority 1**, the only spec; chunks in build order: 01.1, 01.6, 01.3, 01.5, 01.7, 01.2, 01.4, 01.9; 2 open questions; answered: the platform (a cross-platform phone app, web for development), Audible books (DRM-free import only, with a clear import note) and the music source (royalty-free catalog now; Spotify, YouTube and Apple Music studied in 01.9, since Spotify's and YouTube's terms bar mixing their audio)) | 8 left |

## Chunks and pending

- **Chunks:** each spec ends with `## Chunks`, listing only chunks still to build: `NN.k` sized S / M / L, where L is
  one full session at most. Every chunk says which acceptance IDs (`A1`, `A2`, …) it closes; IDs are never
  renumbered or reused.
- **Pending:** a branch writes no shared plan line. A close or a `/plot`'s rows is one new file in `plan/pending/`,
  and the owner's settle on main applies it and removes the file.
