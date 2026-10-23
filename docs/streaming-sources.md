# Streaming sources study: Spotify, YouTube, YouTube Music, Apple Music

The owner's report for chunk 01.9 (closes A23). It answers Open questions 3 and 5 of spec 01: can Mood Read use
these services, how, at what cost, and does a listener's own paid account change anything. It builds nothing; it
feeds 01.10. Every term below was read on 2026-10-23. "Unclear" is treated as no, as agents.md requires.

## 1. Bottom line

- No service allows its music to play under the narration. That holds whether the listener pays or not.
- A paid Spotify, YouTube or Apple Music account opens no path under the narration. Only a direct license from the
  rights-holders would, and its cost is unknown.
- What Mood Read can do with all three: link out from the mood card to the piece in the listener's own app.
  That needs no API and costs nothing.
- What it can also do: save a chapter's pieces as a playlist in the listener's account. Apple Music and YouTube
  allow this today. Spotify allows it on paper, but its quota blocks it past 5 users.
- 01.10 should play the royalty-free catalog by default, and add link-outs (and, later, playlist saving) for the
  services. Nothing from a service plays inside Mood Read.

## 2. Summary table

| Path | Spotify | YouTube | YouTube Music | Apple Music |
|---|---|---|---|---|
| Play under narration | Not allowed (III.7) | Not allowed (III.I.7, III.I.9) | Not allowed (no public API) | Not allowed (DPLA 3.3.6(D), App Review 4.5.2(ii)) |
| Play between chapters | Unclear, treated as no ("segue", III.7) | Allowed only in a visible foreground player, 200x200 px or more; no lock screen. Free | Not allowed | Unclear, treated as no (auto-play fails; still a song at a set moment) |
| Link out from the mood card | Allowed. Free with a search URL; exact-track links need the Web API quota | Allowed. Free | Allowed. Free | Allowed. Free; follow Apple's identity guidelines |
| Save a playlist to the listener's account | Allowed by policy, blocked by quota: 5 users until a registered business with 250k monthly users | Allowed. Free; 10,000 units a day, about 6 books a day | Only through the YouTube Data API; whether it shows in YouTube Music is unknown | Allowed. Free API; needs the $99 a year Apple Developer Program; subscribers only |
| Licensing deal | Unclear, treated as no. No program, no price | Unclear, treated as no. No program, no price | Unclear, treated as no. No program, no price | Unclear, treated as no. Apple points to rights-holders; no price |

## 3. Each service

### Spotify

Sources: Spotify Developer Policy, effective 15 May 2025 (https://developer.spotify.com/policy) and the Spotify
Developer Terms v10 (https://developer.spotify.com/terms). Read 2026-10-23.

**Under the narration: not allowed.** Policy III.7: "Do not permit any device or system to segue, mix, re-mix, or
overlap any Spotify Content with any other audio content (including other Spotify Content)." This covers the Web
API, the Web Playback SDK and the iOS/Android SDK (App Remote) alike: "any device or system". The iOS SDK plays
"with the Spotify app running in the background as a service" (https://developer.spotify.com/documentation/ios),
which is still Spotify Content overlapping Mood Read's narration.

**Between chapters: unclear, treated as no.** III.7 also bans a "segue" to "any other audio content". Handing off
from narration to a Spotify track at a chapter boundary is arguably a segue. Only Spotify's written confirmation
would settle it.

**Link out from the mood card: allowed.** The Design Guidelines (https://developer.spotify.com/documentation/design)
say to "always link to the Spotify app", with button text "OPEN SPOTIFY, PLAY ON SPOTIFY or LISTEN ON SPOTIFY". A
plain search link needs no API. A link to the exact track needs the Web API, so it falls under the quota limits
below. Any Spotify title or artwork shown "must always be accompanied by the Spotify brand".

**Save a playlist: allowed by policy, blocked in practice.** The endpoints still exist after the February 2026
changes: "Creates a new playlist for logged in users."
(https://developer.spotify.com/documentation/web-api/references/changes/february-2026). But an app in development
mode can serve only 5 users (see costs).

**Licensing deal: unclear, treated as no.** Spotify publishes no licensing program. Its only commercial carve-out
is for apps that do not stream (IV.3). A deal would need a written agreement with Spotify or with the
rights-holders. No price is published.

**Extra risk, III.5:** "Do not create any product or service which is integrated with streams or content from
another service." Whether Spotify beside YouTube or Apple Music in one app breaks this is unclear. It needs
Spotify's written confirmation.

**A listener's paid account.** Premium is what lets an app stream at all (IV.1: "Streaming of music sound
recordings through the Spotify Platform shall only be made available to subscribers ... to the Premium Spotify
Service"). But III.7 has no Premium exception, so Premium opens no path under the narration. Free listeners can
still use the link-out and, quota permitting, playlist saving.

**Costs and quotas.** No API fee. Development mode allows "Up to 5 authenticated Spotify users", and "The app
owner must have a Spotify Premium account" (https://developer.spotify.com/documentation/web-api/concepts/quota-modes).
Since 9 March 2026 each developer gets one Client ID
(https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security). Extended quota
needs an "Established Business Entity (legally registered business or organisation)", an "active, and Launched
Service", "at least 250k MAUs", and an application from a company email. "This review process can take up to six
weeks."

**Conditions.** Spotify branding and attribution wherever its content shows. Streaming only to Premium users.
Mood Read stays free, with no ads and no e-commerce around it (IV.2.1 to IV.2.3).

**Changed since spec 01 (2026-10-22).** III.7, IV.1 and IV.2 read the same. New to this report: the III.5 risk and
the 2026 development-mode limits (5 users, one Client ID, the extended-quota bar).

### YouTube

Source: YouTube API Services Developer Policies, last updated 2026-10-15
(https://developers.google.com/youtube/terms/developer-policies). Read 2026-10-23.

**Under the narration: not allowed.** III.I.7: you must not "separate, isolate, or modify the audio or video
components of any YouTube audiovisual content ... For example, you must not apply alternate audio tracks to
videos;". III.I.9 bars content "from a background player, meaning a player that is not displayed in the page, tab,
or screen that the user is viewing;". An audio-only or background player is therefore not allowed either.
Downloading or caching a track for a bundled loop needs YouTube's "prior written approval" to "download, import,
backup, cache, or store copies of YouTube audiovisual content" (III.E.1.a), and offline playback is barred
(III.E.1.b).

**Between chapters: allowed, but only in a visible player.** The Required Minimum Functionality
(https://developers.google.com/youtube/terms/required-minimum-functionality) asks for an embedded player on screen,
in the foreground, at least "200px by 200px", with no "overlays, frames, or other visual elements in front of" it.
It "must not initiate an automatic playback until the player is visible". No lock screen or background play
(III.I.9), and no split audio (III.I.7). That rules out lock-screen listening (A4), so this path does not fit
Mood Read.

**Link out from the mood card: allowed.** If Mood Read shows any YouTube API data, III.I.4 applies: it "must not
remove, obscure, alter, or disable any links that appear in YouTube players or in API Data".

**Save a playlist: allowed.** The Data API's playlists.insert and playlistItems.insert can build a chapter
playlist in the listener's account. Playlist actions must be clearly labelled as YouTube actions and started by
the listener (III.C.2).

**Licensing deal: unclear, treated as no.** No program and no price is published.

**A listener's paid account.** Opens nothing. The policies never mention YouTube Premium. Premium's background play
lives only in YouTube's own apps.

**Costs and quotas.** No API fee. The default quota is "10,000 units per day"
(https://developers.google.com/youtube/v3/getting-started). playlists.insert and playlistItems.insert cost 50 units
each. Search has its own bucket: "100 quota per day. Each call costs 1 quota."
(https://developers.google.com/youtube/v3/determine_quota_cost). A 30-chapter book is about 1,550 units, so the
default quota saves roughly 6 books a day across all listeners, with at most 100 searches a day. More quota comes
through an "API Compliance Audit" (III.D.3).

**Conditions.** Link to YouTube's Terms of Service (III.A.1). Never charge for embedded viewing (III.F.3.a).

**Changed since spec 01.** Nothing.

### YouTube Music

Sources: the YouTube developer documentation index (https://developers.google.com/youtube/documentation) and the
YouTube Terms of Service (https://www.youtube.com/static?template=terms). Read 2026-10-23.

**Any playback: not allowed.** YouTube Music has no public API. The documentation index lists only the IFrame
Player, the iOS Helper, Data, Live Streaming, Analytics, Reporting and Content ID APIs. Unofficial wrappers such as
ytmusicapi breach Restriction 3 of the Terms of Service, which bars "automated means (such as robots, botnets or
scrapers)" without "YouTube's prior written permission". So neither under the narration nor between chapters.

**Link out from the mood card: allowed.** A plain music.youtube.com link.

**Save a playlist:** only through the YouTube Data API (above). Whether such a playlist appears in YouTube Music is
unknown.

**Licensing deal: unclear, treated as no.**

**A listener's paid account.** Opens nothing.

**Changed since spec 01.** Nothing.

### Apple Music

Sources: the Apple Developer Program License Agreement, DPLA
(https://developer.apple.com/support/terms/apple-developer-program-license-agreement/) and the App Review
Guidelines (https://developer.apple.com/app-store/review/guidelines/). Read 2026-10-23.

**Under the narration: not allowed.** DPLA 3.3.6(D): "You may not, and You may not permit Your end users to,
download, upload, or modify any MusicKit Content and MusicKit Content cannot be synchronized with any other
content, unless otherwise permitted by Apple in the Documentation". App Review 4.5.2(ii): "if you want your app to
play a specific song at a particular moment ... you'll need to contact rights-holders directly to get their
permission (such as synchronization or adaptation rights)". This covers the system music player and an in-app
player alike. MusicKit on the Web may be used only "as a stand-alone library ... not to recombine MusicKit JS with
any other JavaScript code" (3.3.6(D)). MusicKit for Android exists (https://developer.apple.com/musickit/), but its
separate license was not read, so it is unclear and treated as no.

**Between chapters: unclear, treated as no.** 3.3.6(D) says "users must initiate playback and be able to navigate
playback using standard media controls such as 'play,' 'pause,' and 'skip'". So auto-play at a chapter break fails.
A tap-to-play track tied to a chapter is still "a specific song at a particular moment" under 4.5.2(ii).

**Link out from the mood card: allowed.** Follow the Apple Music Identity Guidelines. If Mood Read ever shows a
preview, it needs "a link to the corresponding music in iTunes or Apple Music" (5.2.5), and a preview may not be
used as "background music" (5.2.5).

**Save a playlist: allowed.** "your app can create playlists, add songs to their library" (4.5.2(i)). It needs a
purpose string explaining the access (4.5.2(iii)). User data may be used only for a disclosed function (3.3.6(D)).

**Licensing deal: unclear, treated as no.** Apple names the route itself: contact the rights-holders. That means
quotes from labels and publishers. No price is known.

**A listener's paid account.** A subscription is what unlocks full songs (DPLA 1.2: "the set of APIs that enable
Apple Music users to access their subscription"). It does not lift the sync bar in 3.3.6(D) or 4.5.2(ii). There is
no free tier, so playlist saving reaches subscribers only.

**Costs.** No MusicKit fee. The Apple Developer Program costs "99 USD per membership year"
(https://developer.apple.com/programs/enroll/). The fee waiver covers only nonprofits, schools and government, "Not
... an individual, sole proprietor, or single-person business"
(https://developer.apple.com/help/account/membership/fee-waivers).

**Conditions.** No making money from Apple Music access ("e.g. in-app purchase, advertising, requesting user
info", 3.3.6(D)). Follow the Apple Music Identity Guidelines.

**Changed since spec 01.** Spec 01 called Apple Music "unverified". It is now verified: not allowed under the
narration.

## 4. What this means for 01.10

Recommended scope, ranked from safest:

1. **Under the narration: the royalty-free catalog and the bundled soundscapes, by default.** This is the only
   legal path under the narration. Each recording is checked against A18 before it plays.
2. **Mood-card link-outs to Spotify, YouTube Music (or YouTube) and Apple Music.** The mood card is the playing
   chapter's expanded row in the river. It can offer "Listen on Spotify" and the like for the named piece. Nothing
   plays inside Mood Read; the listener's own app opens. No API and no cost.
3. **Optional: save the book's pieces as a playlist in the listener's account.**
   - Apple Music: for subscribers, once the owner holds the $99 a year Apple Developer Program.
   - YouTube: through the Data API, about 6 books a day on the default quota; an audit for more.
   - Spotify: not until extended quota, which needs a registered business with 250k monthly users.
4. **Not recommended: YouTube between chapters.** It is allowed only in a visible foreground player of at least
   200x200 px, never on the lock screen or in the background. That rules out lock-screen listening (A4), which
   Mood Read is built around. Spotify and Apple Music between chapters are unclear, so no.

A connected paid account (the owner's hope in Open questions 3) opens no path under the narration on any service.
That would need direct licenses from the rights-holders.

## 5. Owner decisions this raises

Each is a question for the owner to answer later. The recommended default is what the loop assumes until then.

a. **Seek direct licenses from rights-holders?** The cost is unknown; it needs quotes from labels and publishers.
   Default: no, not for now.
b. **Do mood-card link-outs and playlist saving become a chunk of their own?** Default: yes, a small chunk after
   01.10's catalog playback.
c. **Ask Spotify in writing about III.5 before Spotify sits beside other services?** III.5 bars a product
   "integrated with streams or content from another service". Default: link-outs only, which play nothing in the
   app, until Spotify answers.
d. **Enrol in the Apple Developer Program ($99 a year)?** It is needed for Apple Music playlist saving, and for iOS
   distribution anyway. Default: yes, when iOS distribution comes up.

## 6. Sources (all read 2026-10-23)

Spotify
- Developer Policy (effective 15 May 2025): https://developer.spotify.com/policy
- Developer Terms v10: https://developer.spotify.com/terms
- Design Guidelines: https://developer.spotify.com/documentation/design
- iOS SDK: https://developer.spotify.com/documentation/ios
- Web API February 2026 changes: https://developer.spotify.com/documentation/web-api/references/changes/february-2026
- Quota modes: https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- Developer access update (2026-02-06):
  https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security

YouTube and YouTube Music
- API Services Developer Policies (updated 2026-10-15): https://developers.google.com/youtube/terms/developer-policies
- Required Minimum Functionality: https://developers.google.com/youtube/terms/required-minimum-functionality
- Data API getting started (quota): https://developers.google.com/youtube/v3/getting-started
- Quota costs: https://developers.google.com/youtube/v3/determine_quota_cost
- Documentation index: https://developers.google.com/youtube/documentation
- YouTube Terms of Service: https://www.youtube.com/static?template=terms

Apple Music
- Apple Developer Program License Agreement:
  https://developer.apple.com/support/terms/apple-developer-program-license-agreement/
- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- MusicKit: https://developer.apple.com/musickit/
- Enrolment and fee: https://developer.apple.com/programs/enroll/
- Fee waivers: https://developer.apple.com/help/account/membership/fee-waivers
