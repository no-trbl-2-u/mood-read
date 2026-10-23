---
date: 2026-10-23
---
## Add plan/01-audiobook-player-app-similar-to-audible.md
~~~ acceptance
- **A?timebar** Every time readout of the playing book sits in the docked mini player, beside its progress bar:
  the playing chapter's elapsed and length ("3:05 / 11:45") and, while a sleep timer runs, what is left of it
  (minutes, or "end of chapter"). The chapter river carries no times: no per-row length, and the playing row
  shows no "3:05 of 11:45" line and no sleep-timer line.
~~~
~~~ chunks
- [ ] **01.?timebar** Time readouts move from the river to the mini player · S · closes A?timebar · needs —
  - The owner asked (2026-10-23), over a screenshot of the river: "Move all the time related information down
    to the bottom near the player."
  - `src/player/ChapterRiver.tsx` drops the row length (`styles.duration`), the expanded row's elapsed line
    (`chapter-elapsed`) and its sleep-timer line; `src/player/MiniPlayer.tsx` shows elapsed / length with
    tabular numbers flanking or under the progress bar, and a muted sleep readout when a timer runs. Keep a
    `testID` on each and move the e2e assertions (`e2e/player.spec.ts`) to the mini player.
  - The playing row keeps its heavy left rule and play mark; with no time line it stays expanded for the mood
    card and mixer later chunks put there.
  - Out of scope: the Bookmarks sheet's "Ch. N — mm:ss" rows (a list of places, not a readout) and the Speed &
    Sleep sheet's chips stay as they are.
~~~

## Edit plan/README.md
~~~ old
**Asap** (built before the table, in this order, once their needs are done):


**Held**
~~~
~~~ new
**Asap** (built before the table, in this order, once their needs are done):

- **01.?timebar** · the owner's ask about the player on screen now; S, and it moves the readouts before 01.3 and
  01.4 fill the expanded row

**Held**
~~~

## Edit plan/bearings.md
~~~ old
- **Mini player:** docked at the bottom of the river and of every sheet over it: cover, chapter title over a
  progress bar that scrubs, back 30 s, play/pause, forward 30 s, all in thumb reach. None in the library.
~~~
~~~ new
- **Mini player:** docked at the bottom of the river and of every sheet over it: cover, chapter title over a
  progress bar that scrubs, back 30 s, play/pause, forward 30 s, all in thumb reach. None in the library. It holds
  every time readout of the playing book (elapsed / length, the sleep timer's remainder); the river shows none
  (D?time-in-mini-player).
~~~

## Decisions
- **D?time-in-mini-player** · 2026-10-23 · Every time readout of the playing book lives in the docked mini player;
  the chapter river shows titles and moods, never times. *Why:* the owner asked for the times down by the player,
  where the controls already are, and it leaves the expanded row to the mood card and mixer.
