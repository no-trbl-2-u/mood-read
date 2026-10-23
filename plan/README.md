# Mood Read roadmap

Mood Read is an audiobook player in the spirit of Audible that scores each chapter: AI works out the emotions a
chapter evokes and names a no-vocals piece to match, and the listener hears an ambient soundscape (later, the
piece) under the narration. This folder holds the
plan: one file per initiative, written before the code, kept current as we build, and deleted when done.

## Sessions

`/next` works through this table: it picks the next chunk whose needs are done (the Asap lane first, then numbered
priorities, then table order), builds it, and removes it. `/plot` puts a task into the plan with its place in line.

**Asap lane** (`/plot asap`): none yet.

| # | Initiative | Spec | Status | Progress |
|---|---|---|---|---|
| 1 | Mood Read v1 in two parts. Part 1, the player: your own audiobooks (01.1, 01.6) with an ambient soundscape under the narration (01.3, 01.7) and a mixer (01.5). Part 2: each chapter's moods researched by AI, with one named no-vocals piece per chapter, named but not played in v1 (01.2, 01.4). After v1: playing the pieces (01.10), after a streaming study (01.9) | [01-audiobook-player-app-similar-to-audible.md](01-audiobook-player-app-similar-to-audible.md) | planned (**priority 1**, the only spec; build order: part 1 01.1, 01.6, 01.3, 01.5, 01.7; part 2 01.2, 01.4; after v1 01.9, 01.10. Open questions 1-7 answered; 01.2 still needs the AI provider and spend cap named) | 9 left |

## Chunks and pending

- **Chunks:** each spec ends with `## Chunks`, listing only chunks still to build: `NN.k` sized S / M / L, where L is
  one full session at most. Every chunk says which acceptance IDs (`A1`, `A2`, …) it closes; IDs are never
  renumbered or reused.
- **Pending:** a branch writes no shared plan line. A close or a `/plot`'s rows is one new file in `plan/pending/`,
  and the owner's settle on main applies it and removes the file.
