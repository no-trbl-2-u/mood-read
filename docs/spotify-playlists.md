# Spotify chapter playlists: the rights check

The owner's report for chunk 05.12 (closes A14). It answers one question before any Spotify code is written: may
Mood Read create one Spotify playlist per chapter in the listener's own account, of instrumental tracks the scorer
names, as spec 05 designs it (05.13)? It builds nothing. The verdicts are the rights-checker's, on Spotify Developer
Policy III.5 and III.7 and the Developer Terms. Every term below was read on 2026-10-24. "Unclear" is treated as no,
as agents.md requires, so an unclear verdict holds 05.13.

The streaming study this follows: docs/streaming-sources.md (01.9).

## 1. Bottom line

- 05.13 waits. Two of the four questions are unclear and one is not allowed; unclear counts as no.
- Nothing in Spotify's terms bans creating playlists, and the API still offers it. The trouble is the purpose: the
  feature exists to put music under the narration, and Policy III.7 bars any overlap of Spotify Content with other
  audio on "any device or system".
- III.5 is a second risk: Mood Read streams LibriVox and archive.org audio in the same app, and III.5 bars a product
  "integrated with streams or content from another service".
- Having the AI name tracks and the Web API confirm them is defensible only with a one-way data flow: no Spotify
  data ever reaches the scorer, the proxy or any model.
- Companion use, the listener playing the playlist in Spotify while Mood Read plays narration or its bed, is not
  allowed as a designed feature. Mood Read not controlling Spotify playback does not cure it.
- The 5-user cap holds: the owner plus up to 4 allowlisted testers in development mode, and only if the other three
  questions clear. Extended quota needs a registered business with 250k monthly users; an individual owner cannot
  apply.
- Only Spotify's written confirmation on III.7 and III.5 would unblock 05.13.

## 2. Summary table

| Question | Verdict |
|---|---|
| 1. Per-chapter playlists in the listener's account, as designed | Unclear (hold 05.13). III.7 and III.5 risk |
| 2. The AI names tracks, then Web API search or track lookup confirms them | Unclear. Defensible only with a one-way data flow |
| 3. Companion use: the playlist plays in Spotify under Mood Read's narration or bed | Not allowed (III.7, and III.5) |
| 4. The 5-user cap | Not allowed beyond 5 users. Allowed for the owner plus up to 4 testers in development mode, only if 1 to 3 clear |

## 3. Each question

### 1. Per-chapter playlists in the listener's account, as designed

Sources: Spotify Developer Policy, effective 15 May 2025 (https://developer.spotify.com/policy), III.7, III.5 and
III.11; Spotify Developer Terms v10, effective 15 May 2025 (https://developer.spotify.com/terms). Read 2026-10-24.

**Verdict: unclear, hold 05.13.**

Nothing bans creating playlists, and the API still offers it: "`POST /users/{user_id}/playlists` is replaced by
`POST /me/playlists`" (https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide,
read 2026-10-24).

But the feature's purpose is music under narration, which III.7 bars: "Do not permit any device or system to segue,
mix, re-mix, or overlap any Spotify Content with any other audio content (including other Spotify Content)."
(https://developer.spotify.com/policy, III.7, read 2026-10-24).

A second risk is III.5: "Do not create any product or service which is integrated with streams or content from
another service." Mood Read streams LibriVox and archive.org audio in the same app
(https://developer.spotify.com/policy, III.5, read 2026-10-24).

**Conditions.**

- Only Spotify's written confirmation settles it.
- III.11: the integration "must add independent value or functionality that improves users' interactions with
  Spotify".
- VI.2: names and copy must not "imply any endorsement, tie-in, co-branding or promotion by Spotify".
- Spotify Marks used per the Branding Guidelines (VI.1).
- III.8: the app must not be "targeted to children".

**Drift since 01.9.** The Policy is unchanged. The API changed (February 2026 migration guide): see section 5.

### 2. The AI names tracks, then Web API search or track lookup confirms them

Sources: Spotify Developer Terms v10, II.8 and IV.2.1 (https://developer.spotify.com/terms); Spotify Developer
Policy III.13 and III.14 (https://developer.spotify.com/policy). Read 2026-10-24.

**Verdict: unclear.**

Terms IV.2.1 bars "using the Spotify Platform or any Spotify Content to train a machine learning or AI model ... or
otherwise ingesting Spotify Content into a machine learning or AI model" (https://developer.spotify.com/terms,
IV.2.1, read 2026-10-24). "Spotify Content" is "any content, data, information or material made available through
the Spotify Platform", metadata included (II.8). Policy III.13: "Do not analyze the Spotify Content or the Spotify
Service for any purpose, including without limitation, creating new or derived ... functionality"
(https://developer.spotify.com/policy, read 2026-10-24).

**Conditions.** Defensible only with a one-way data flow:

- Spotify results (IDs, titles, durations, search hits, not-found signals) never reach the scorer, the proxy or any
  model: not in prompts, and not as feedback.
- Fitting tracks to the chapter's duration happens in app code only.
- Terms IV.3.1.1 bars a cached Spotify track database beyond what is "strictly necessary".

It is settled only by Spotify's written confirmation, or by the owner accepting the one-way constraint and the
residual III.13 risk.

### 3. Companion use

The listener plays the playlist in Spotify while Mood Read plays the narration or its bed.

Source: Spotify Developer Policy III.7 (and III.5) (https://developer.spotify.com/policy). Read 2026-10-24.

**Verdict: not allowed.**

III.7: "Do not permit any device or system to segue, mix, re-mix, or overlap any Spotify Content with any other
audio content" (https://developer.spotify.com/policy, III.7, read 2026-10-24).

**Conditions.**

- III.7 bars the developer from permitting overlap on any device or system, not only mixing in its own player.
- A feature built so its playlists sound under Mood Read's narration is designed to produce that overlap.
- Mood Read not controlling Spotify playback does not cure it.
- Only Spotify's written approval would change it.
- A listener doing it on their own is their business under Spotify's user terms. But Mood Read must not design for
  it, suggest it, or pair the playlist with its own audio. It would also fail the extended-quota review.

### 4. The 5-user cap

Sources: Quota modes (https://developer.spotify.com/documentation/web-api/concepts/quota-modes); Spotify Developer
Policy VII.3.5 (https://developer.spotify.com/policy). Read 2026-10-24.

**Verdict: not allowed beyond 5 users. Allowed for the owner plus up to 4 allowlisted testers in development mode,
only if questions 1 to 3 clear.**

Development mode: "Up to 5 authenticated Spotify users can use an app that is in development mode"; "The app owner
must have a Spotify Premium account for apps in development mode to function."

Extended quota: "as of May 15th 2025, Spotify only accepts applications from organizations (not individuals)". The
criteria: "Established Business Entity (legally registered business or organisation)", "Operating an active, and
Launched Service", "Maintaining a minimum of active users (at least 250k MAUs)", "Being available in key Spotify
markets", "Commercial Viability", "Adherence to Terms". And: "Spotify's app review team will ... evaluate it for
compliance with our Developer Policy. This review process can take up to six weeks."
(https://developer.spotify.com/documentation/web-api/concepts/quota-modes, read 2026-10-24).

Policy VII.3.5: "You must use the additional quota granted only for the use case that Spotify reviewed."
(https://developer.spotify.com/policy, read 2026-10-24).

**Conditions.**

- Testers are allowlisted by hand.
- The owner's Premium must stay active.
- An extended-quota application comes from a company email.
- Request quota is now shared per developer account (July 2026 blog,
  https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates; a lead, not checked line by line).
- An individual owner with no registered business and no 250k monthly users cannot apply.
- Even then, the III.7 review would likely fail on question 3.

**Drift.** None on the cap or the criteria against docs/streaming-sources.md.

## 4. What this means for 05.13

05.13 waits. Questions 1 and 2 are unclear, and unclear counts as no; question 3 is not allowed.

What would unblock it, all of these:

1. **Spotify's written confirmation on III.7 and III.5**: that per-chapter playlists from an audiobook app which
   streams LibriVox and archive.org audio do not breach either.
2. **A one-way data flow**: no Spotify data ever reaches the scorer, the proxy or any model. The scorer names
   tracks; app code looks them up and fits them to the chapter's length; nothing comes back.
3. **Extended quota for more than the owner and four testers**: that needs a registered business with 250k monthly
   users. Until then, the feature could serve 5 people at most.

Whatever happens, Mood Read must never design for, suggest, or pair a Spotify playlist with its own audio. No copy,
button or flow may invite the listener to play a chapter playlist under the narration or the bed.

## 5. API drift notes for whoever builds 05.13

The Developer Policy is unchanged since 01.9 (effective 15 May 2025). The Web API changed in February 2026
(https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide, read 2026-10-24):

- Create a playlist with `POST /me/playlists` (it replaces `POST /users/{user_id}/playlists`).
- Add items with `POST /playlists/{id}/items`.
- Search `limit` maximum dropped from 50 to 10.
- Batch `GET /tracks` is removed: "Fetch items individually instead".
- `popularity` is removed.
- `duration_ms` remains, so fitting a playlist to a chapter's duration still works.
- Request quota is now shared per developer account (July 2026 blog, unchecked lead; see question 4).

## 6. Sources (all read 2026-10-24)

- Developer Policy (effective 15 May 2025): https://developer.spotify.com/policy
- Developer Terms v10 (effective 15 May 2025): https://developer.spotify.com/terms
- Web API February 2026 migration guide:
  https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- Quota modes: https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- Web API quota updates (2026-07-23, a lead): https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates
