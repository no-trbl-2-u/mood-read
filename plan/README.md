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

## Chunks and pending

- **Chunks:** each spec ends with `## Chunks`, listing only chunks still to build: `NN.k` sized S / M / L, where L is
  one full session at most. Every chunk says which acceptance IDs (`A1`, `A2`, …) it closes; IDs are never
  renumbered or reused.
- **Pending:** a branch writes no shared plan line. A close or a `/plot`'s rows is one new file in `plan/pending/`,
  and the owner's settle on main applies it and removes the file.
