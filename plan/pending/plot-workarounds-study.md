---
date: 2026-10-23
---
## Add plan/01-audiobook-player-app-similar-to-audible.md
~~~ acceptance
- **A?workarounds** The owner has a written report of compliant workarounds for what Spotify, YouTube, Apple Music
  and Audible won't allow: for each, the alternatives that give the listener the same thing (music under the
  narration, or their Audible books in Mood Read), each with the rights-checker's verdict on its license or terms,
  its cost, the build it would take and how close it comes, ranked, before 01.10 picks its source.
~~~
~~~ chunks
- [ ] **01.?workarounds** Workarounds for the blocked services: a study · M · closes A?workarounds · needs —
  - The owner asked (2026-10-23): "Find potential workarounds for not being able to use youtube, spotify, apple
    player, and audible." Same shape as 01.9 and 01.12: the `rights-checker` reads each candidate's live terms,
    the report joins `docs/streaming-sources.md` (or a sibling it links), and it builds nothing.
  - Only compliant routes count (agents.md rule 6, A7, A18): never decrypting AAX/AAXC or using activation bytes,
    ripping or recording a stream, scraping, or an unofficial API; "unclear" counts as no.
  - Music to check: licensed catalogs and libraries that allow in-app use under other audio, B2B music services
    licensed for apps, public-domain recordings, music commissioned or generated under a license that allows it,
    and a companion mode where the listener plays their own service in its own app while Mood Read plays alongside
    (each OS's audio mixing and each service's terms).
  - Audible to check: DRM-free audiobook stores and public-domain libraries the listener can import (01.6), a
    companion mode where Audible plays in Audible's app and Mood Read plays only the bed and follows chapters, and
    linking out to Audible.
  - Already planned, so linked, not redone: mood-card link-outs (01.11), DRM-free imports with the AAX/AAXC note
    (01.6, A7), CC-BY / CC-BY-SA tracks in the catalog (D7).
~~~

## Edit plan/01-audiobook-player-app-similar-to-audible.md
~~~ old
- [ ] **01.10** After v1: play the chapter's piece, looped under the narration · M · closes A17, A18 ·
  needs 01.2, 01.3, 01.5
~~~
~~~ new
- [ ] **01.10** After v1: play the chapter's piece, looped under the narration · M · closes A17, A18 ·
  needs 01.2, 01.3, 01.5, 01.?workarounds
~~~
