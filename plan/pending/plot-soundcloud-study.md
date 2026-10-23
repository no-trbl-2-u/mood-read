---
date: 2026-10-23
---
## Add plan/01-audiobook-player-app-similar-to-audible.md
~~~ acceptance
- **A?soundcloud** The owner has a written report on SoundCloud as a music source: whether its API and terms allow
  Mood Read to play a track under the narration, between chapters or only by linking out; whether
  Creative Commons and other freely licensed tracks on it can join the royalty-free catalog (bundled or streamed,
  with the attribution each license asks); what a listener's own SoundCloud account (Go / Go+) changes; and the
  cost and access steps (API registration, rate limits), before 01.10 picks its source.
~~~
~~~ chunks
- [ ] **01.?soundcloud** SoundCloud as a music source: a study · S · closes A?soundcloud · needs —
  - The owner asked (2026-10-23): "A research pass to see if we can leverage soundcloud as a source for music."
    Same shape as 01.9 (`docs/streaming-sources.md`): the `rights-checker` reads the live API terms and quotes
    them, the report adds a SoundCloud section there (or a sibling file it links), and builds nothing.
  - Check per track, not per site: a Creative Commons license allows Mood Read's use only if it allows commercial
    use where needed, modification-free looping under other audio, and attribution the mood card can show; and the
    piece has no vocals (A20).
~~~

## Edit plan/01-audiobook-player-app-similar-to-audible.md
~~~ old
- [ ] **01.10** After v1: play the chapter's piece, looped under the narration · M · closes A17, A18 ·
  needs 01.2, 01.3, 01.5
~~~
~~~ new
- [ ] **01.10** After v1: play the chapter's piece, looped under the narration · M · closes A17, A18 ·
  needs 01.2, 01.3, 01.5, 01.?soundcloud
~~~
