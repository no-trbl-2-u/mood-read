---
date: 2026-10-23
---
## Edit plan/README.md
~~~ old
| 2 | Bootstrap: the Expo app shell
~~~
~~~ new
| 4 | Android preview APKs: Mood Read installed on a real phone from a preview APK built from main, before any store; iOS after v1 | [04-android-preview.md](04-android-preview.md) | planned | 1 left |
| 2 | Bootstrap: the Expo app shell
~~~

## Edit plan/01-audiobook-player-app-similar-to-audible.md
~~~ old
## Open questions (owner decisions)
~~~
~~~ new
## Owner decisions (all answered)

Every question below is answered; none is open. Elsewhere in the plan, "Open questions N" means item N here.
~~~

## Add plan/01-audiobook-player-app-similar-to-audible.md
~~~ acceptance
- **A?link-outs** Each chapter's mood card links out to its named piece on Spotify, YouTube / YouTube Music and
  Apple Music, and Mood Read plays none of it; a listener can save a book's pieces as a playlist in their own
  YouTube or Apple Music account.
~~~
~~~ chunks
- [ ] **01.?link-outs** Mood-card link-outs and playlist saving · M · closes A?link-outs · needs 01.10
  - As `docs/streaming-sources.md` sets them: each service's branding rules; Spotify gets plain links only (its
    Developer Policy III.5, until the owner revisits it after v1); YouTube playlists through the Data API within
    its daily quota; Apple Music playlists only once the Apple Developer Program is joined (after v1).
~~~

## Edit plan/AUDIT.md
~~~ old
### [needs-user-call] What the streaming study asks of the owner
- category: product
- logged: 2026-10-23 (01.9, `docs/streaming-sources.md` section 5)
- what: (a) seek direct licenses from rights-holders to play a service's music under the narration (cost unknown,
  quotes needed); (b) make mood-card link-outs and playlist saving a chunk of their own; (c) ask Spotify in writing
  about Developer Policy III.5 (no integrating with another service's streams) before Spotify sits beside other
  services; (d) enrol in the Apple Developer Program ($99 a year), needed for Apple Music playlist saving and iOS.
- default taken: (a) no, not for now; (b) yes, a small chunk after 01.10's catalog playback, plotted when 01.10
  lands; (c) link-outs only, which play nothing in the app, until Spotify answers; (d) yes, when iOS distribution
  comes up. 01.10 plays the royalty-free catalog only.
~~~
~~~ new
### [needs-user-call] After the v1 MVP: Spotify III.5, iOS and the Apple Developer Program
- category: product
- logged: 2026-10-23 (the owner's answers to the streaming study, `docs/streaming-sources.md` section 5)
- what: the owner asked to be reminded after the v1 MVP to revisit (1) Spotify Developer Policy III.5 (no
  integrating with another service's streams): ask Spotify in writing, or keep Spotify to plain links; and (2) iOS:
  the Apple Developer Program ($99 a year), which App Store builds and Apple Music playlist saving need.
- default taken: until then Spotify gets plain links only (01.?link-outs), Android preview APKs come first
  (spec 04), and nothing iOS-only is built. Answered the same day: no direct licenses from rights-holders, and
  link-outs with playlist saving plotted after 01.10.
~~~

## Decisions
- **D?catalog-only** · 2026-10-23 · Under the narration Mood Read plays only the royalty-free catalog and bundled
  soundscapes; no direct licenses from rights-holders for now. *Why:* the owner's answer to the streaming study; no
  streaming service allows its music under other audio.
- **D?android-first** · 2026-10-23 · Mood Read reaches phones as Android preview APKs first; iOS, the App Store and
  the Apple Developer Program wait until after the v1 MVP. *Why:* the owner's answer; no Apple fee before v1.
