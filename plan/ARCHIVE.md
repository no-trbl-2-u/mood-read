# Archive

> Append-only: one line per finished chunk, added in the commit
> that closes it. Never edited or reordered. Mark this file
> `merge=union` in `.gitattributes` so parallel closes never
> conflict.

---

Format: `- <date> · <chunk> · <what now works, ≤ 10 words> ·
<commit or range>`. A finished spec gets one more line,
`- <date> · <NN> · spec complete: <title> · absorbed into
identity · deleted in <sha>`; recover its text with
`git log --diff-filter=D -- plan/<NN>-*.md`.
- 2026-10-23 · 03.1 · Three layout boards (A/B/C) compared, recommending chapter river · 24fb1be2..f6aee111
- 2026-10-23 · 02.1 · Expo app shell boots, with typecheck/lint/unit tests in the gate · 552d7f4b..67bd58b4
- 2026-10-23 · 03.2 · Option B, chapter river, is the layout contract · 358ef4e1..358ef4e1
- 2026-10-23 · 03 · spec complete: Layout pass · absorbed into plan/bearings.md Layout and design/layouts/DECISION.md · deleted in "plan: settle 03.2"
- 2026-10-23 · 01.9 · Streaming study: no service may play under narration · 1ac37fe9..1ac37fe9
- 2026-10-23 · 01.12 · SoundCloud study: link out, bundle hand-checked CC-BY tracks · 34202194..34202194
- 2026-10-23 · 01.13 · Workarounds study: CC, generated music, companion mode, DRM-free stores · 4ef5173d..0db06502
- 2026-10-23 · 02.2 · pnpm verify builds the web app and walks it hermetically · 79f6ee10..32b20f36
- 2026-10-23 · 02.3 · A push to main deploys to mood-read.pages.dev · eccba633..eccba633
- 2026-10-23 · 02.4 · pnpm secrets:sync fills the live mood-read-proxy Worker · 14aeba4c..ecb04b50
- 2026-10-23 · 02 · spec complete: Bootstrap · absorbed into plan/bearings.md Stack, External services, Verify gate and Operational notes · deleted in "plan: settle 02.4"
- 2026-10-23 · 01.1 · The player: library, river, transport, speed, sleep, bookmarks, resume · e01c0ee7..5d0a7fb3
- 2026-10-23 · 01.3 · A soundscape bed follows the narration, crossfades at chapters · 73b9a942..766b13b3
- 2026-10-23 · 01.6 · DRM-free files and folders import with tags, covers and chapters · f2f52b98..b89c74f2
- 2026-10-23 · 06.1 · Design system decided: acid sticker tokens in theme.ts · 407cf865..6fca5273
- 2026-10-23 · 01.16 · Every time readout sits in the mini player · 2583cb00..8fb01591
- 2026-10-23 · 06.2 · Every v2 screen and state drawn, in colour · 97d416fd..4c77e5da
- 2026-10-23 · 06.6 · The privacy policy is live at /privacy · b75ff827..b75ff827
- 2026-10-23 · 01.5 · Inline mixer: balance, master, duck under voice, saved per book · 7d90754d..2878edf4
- 2026-10-24 · 01.7 · Six synthesized soundscapes, picked per book or per chapter · 7604d422..d8c4c8d3
- 2026-10-23 · 06.3 · Settings from the library's menu, saved on the device · dfe52489..1e2891f1
- 2026-10-23 · 06.4 · Every screen wears the acid sticker system: Your shelf · 2e0f7a62..6b27e948
- 2026-10-24 · 01.2 · Proxy scores chapter moods and names no-vocals pieces, hermetically tested · 544cb12f..900379f1
- 2026-10-24 · 01.4 · Reached chapters show emotions; the playing row is the mood card · 07017846..a10064f6
- 2026-10-24 · 06.5 · Axe, 44 px and 200% text checks gate every route · 9380a0e1..b5c26981
- 2026-10-24 · 06 · spec complete: Design system, the undrawn screens, Settings, accessibility and a privacy policy · absorbed into plan/bearings.md Visual & tonal defaults, the route contract and standing decisions, and design/system/DECISION.md and design/layouts/DECISION.md · deleted in "plan: settle 06.5"
- 2026-10-24 · 01.14 · Companion mode plays the bed beside another app, no narration · 103fa672..ca7361bf
- 2026-10-24 · 05.6 · Downloads: queue, pause, resume, retry and a storage meter · b992bcb2..6cc5d7cd
- 2026-10-24 · 01.17 · Scoring in the river: start, progress, cap paused, first-run note, Rescore in the overflow · 50ada76..fa0bbd8
- 2026-10-24 · 05.8 · Browse searches LibriVox and downloads a book onto the shelf · 265e46f8..4ae007cf
- 2026-10-24 · 05.1 · Catalog contract, A1 validator, catalog:add and the app reader · 7009ca4a..20117474
- 2026-10-24 · 07.1 · Scorer returns ordered scenes with spans, one piece each · 5f3809de..9a3c3304
- 2026-10-24 · 05.5 · Credits screen from the library's menu and Settings · 35fcca77..be8decdc
- 2026-10-24 · 07.3 · The bed fades in, fades out and holds for the opening · 2060db17..2060db17
- 2026-10-24 · 05.12 · Spotify playlists verdict: unclear and not allowed, 05.13 held · d03f4351..d03f4351
- 2026-10-24 · 07.4 · Fits and Doesn't fit on the mood card, kept per chapter · be37c6d4..be37c6d4
- 2026-10-24 · 07.7 · Shelf shows each book's mood fingerprint; Mood filter finds books · e77ac9f4..e77ac9f4
- 2026-10-24 · 05.9 · Public-domain books score from their own Gutenberg text · da2c3390..ed19936a
- 2026-10-24 · 07.8 · Your soundtrack lists every piece played, by book · a35118d3..a35118d3
- 2026-10-24 · 05.10 · Browse shows pre-scored books' overall moods; prescore within half the cap · 2157748e..a7f53301
- 2026-10-24 · 07.2 · The bed follows scenes; the card shows the playing scene · e2f588b7..65f4b796
- 2026-10-24 · 05.20 · Browse opens on Popular on LibriVox, pre-scored books first · afc0e9e9..a518afe4
- 2026-10-24 · 01.19 · A chapter's own soundscape follows merges and splits · 9e388846..314788b8
- 2026-10-24 · 07.6 · Set the mood seeds an unscored book or chapter · 96646fa7..0ad84c10
- 2026-10-24 · 01.21 · The proxy limits new runs per client and early rescores · f6633b70..edec73b0
- 2026-10-24 · 01.22 · A reached chapter's mood card opens from its chips · 39bce218..f1e14d05
- 2026-10-24 · 01.18 · A pause holds through a file handoff; no button flicker · d2870de2..7defefd4
- 2026-10-24 · 07.5 · Verdicts reach the proxy as daily counts that order alternates · eecded0e..eecded0e
- 2026-10-24 · 07 · spec complete: Mood depth: scenes, a bed that enters and leaves, verdicts, seeded moods, a mood lens on the shelf · absorbed into plan/bearings.md standing decisions and the route contract, and identity/decisions/2026.md D18, D19, D22-D32 · deleted in "plan: settle 01.18, 07.5"
- 2026-10-24 · 01.24 · dropped via oversight: the owner chose OpenAI only (D33) · (this commit)
- 2026-10-24 · 01.25 · A busy proxy reads as "try later", not unreachable · cd17ca24..ee44e67f
- 2026-10-25 · 05.19 · The app reads the live music catalog from R2 · 788cb09d..788cb09d
- 2026-10-25 · 05.22 · pnpm prescore --from scores the owner's own books · 7f9e0fb2..8e668757
- 2026-10-25 · 05.21 · Owner builds copy the library's books for pre-scoring · 814254b9..a01032b7
- 2026-10-25 · 05.2 · The catalog holds 46 cleared pieces across every emotion · 63b23d67..032a04e2
- 2026-10-25 · 05.3 · The scorer names catalog pieces only; old books re-match · a3daf1a4..8d572585
- 2026-10-25 · 01.10 · The Music chip loops the chapter's licensed catalog piece · bc98d191..bc98d191
- 2026-10-25 · 05.4 · One Build playlist press downloads every piece a book plays · 07726c1b..07726c1b
- 2026-10-25 · 05.7 · Remove download keeps the book; shared pieces survive deletion · 39405a54..39405a54
- 2026-10-25 · 05.16 · Finished books, and the shelf sorts, filters by state and searches past ten books · 2c70c6ac..2c70c6ac
- 2026-10-25 · 05.17 · Settings exports the library, no audio, and imports it back · ec48a8aa..ec48a8aa
- 2026-10-25 · 05.23 · Running downloads read Downloading; stalled ones fail and retry · plan only
- 2026-10-25 · 05.24 · A scoring error can be dismissed and keeps the band's other controls · plan only
- 2026-10-26 · 05.25 · Already shipped: 1b32f53 capped web downloads at one book · f4fdff6f..f4fdff6f
- 2026-10-26 · 04.1 · Owner checked the preview APK: plays, background, lock screen, speed 0.5x-2x · (this commit)
- 2026-10-26 · 04 · spec complete: Android preview APKs · absorbed into plan/bearings.md Decisions standing for the autonomous loop · deleted in (this commit)
- 2026-10-26 · 01.15 · Owner's phone pass: background, lock screen, speed, folder picker, loops, Music layer work (duck-under-voice split to 01.28) · (this commit)
- 2026-10-26 · 01.23 · Companion mode works beside Audible on Android (iPhone check deferred with iOS) · (this commit)
- 2026-10-27 · 05.11 · A one-file book splits losslessly into per-chapter MP3/WAV files · 1902dfcd..90d2456d
