# Streaming sources study: Spotify, YouTube, YouTube Music, Apple Music, SoundCloud

The owner's report for chunk 01.9 (closes A23). It answers Open questions 3 and 5 of spec 01: can Mood Read use
these services, how, at what cost, and does a listener's own paid account change anything. It builds nothing; it
feeds 01.10. Every term below was read on 2026-10-23. "Unclear" is treated as no, as agents.md requires.

It now also covers SoundCloud, for chunk 01.12 (closes A25). Its terms were read on 2026-10-23 too. SoundCloud adds
one question the others do not raise: can single Creative Commons tracks from it join the royalty-free catalog.

## 1. Bottom line

- No service allows its music to play under the narration. That holds whether the listener pays or not.
- A paid Spotify, YouTube or Apple Music account opens no path under the narration. Only a direct license from the
  rights-holders would, and its cost is unknown.
- What Mood Read can do with all three: link out from the mood card to the piece in the listener's own app.
  That needs no API and costs nothing.
- What it can also do: save a chapter's pieces as a playlist in the listener's account. Apple Music and YouTube
  allow this today. Spotify allows it on paper, but its quota blocks it past 5 users.
- SoundCloud's API does not clearly allow play under the narration or between chapters, so both are treated as
  no. A listener's Go or Go+ account opens nothing: that content needs a separate written agreement.
- A plain soundcloud.com link-out from the mood card works, needs no API and costs nothing.
- Some SoundCloud tracks carry a Creative Commons license. Hand-picked CC-BY, CC-BY-SA or confirmed CC0 tracks can
  be bundled into the royalty-free catalog with credit, after a check of each track. NC, ND and all-rights-reserved
  tracks cannot.
- 01.10 should play the royalty-free catalog by default, and add link-outs (and, later, playlist saving) for the
  services. Nothing from a service plays inside Mood Read.

## 2. Summary table

| Path | Spotify | YouTube | YouTube Music | Apple Music | SoundCloud |
|---|---|---|---|---|---|
| Play under narration | Not allowed (III.7) | Not allowed (III.I.7, III.I.9) | Not allowed (no public API) | Not allowed (DPLA 3.3.6(D), App Review 4.5.2(ii)) | Unclear, treated as no (play must be "deliberately initiated"; no "on-demand listening service") |
| Play between chapters | Unclear, treated as no ("segue", III.7) | Allowed only in a visible foreground player, 200x200 px or more; no lock screen. Free | Not allowed | Unclear, treated as no (auto-play fails; still a song at a set moment) | Unclear, treated as no (auto-play fails; tap-to-play still meets the on-demand bar) |
| Link out from the mood card | Allowed. Free with a search URL; exact-track links need the Web API quota | Allowed. Free | Allowed. Free | Allowed. Free; follow Apple's identity guidelines | Allowed. Free; a plain soundcloud.com link needs no API |
| Save a playlist to the listener's account | Allowed by policy, blocked by quota: 5 users until a registered business with 250k monthly users | Allowed. Free; 10,000 units a day, about 6 books a day | Only through the YouTube Data API; whether it shows in YouTube Music is unknown | Allowed. Free API; needs the $99 a year Apple Developer Program; subscribers only | Not checked |
| Licensing deal | Unclear, treated as no. No program, no price | Unclear, treated as no. No program, no price | Unclear, treated as no. No program, no price | Unclear, treated as no. Apple points to rights-holders; no price | Unclear, treated as no. Go content needs a separate written agreement; other uses only by case-by-case approval |

SoundCloud also raises a path the others do not: **Creative Commons tracks into the royalty-free catalog.** CC-BY
and CC-BY-SA: yes, with credit, after a check of each track. CC0 ("no-rights-reserved"): yes once the deed is
confirmed. NC, ND and all-rights-reserved: no. See the SoundCloud section below.

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

### SoundCloud

Sources: the SoundCloud API Terms of Use, effective 30 March 2024
(https://developers.soundcloud.com/docs/api/terms-of-use), SoundCloud's API guide, registration, rate-limit and
logo pages, and the Creative Commons licenses and FAQ (all listed in Sources). Read 2026-10-23. Two pages would not
load: SoundCloud's own Terms of Use (https://soundcloud.com/terms-of-use, an error page) and its Creative Commons
help article (https://help.soundcloud.com/hc/en-us/articles/115003566748, refused with a 403). What they say is
unknown. Long clauses are quoted below as fragments.

SoundCloud differs from the other four. Much of its music is uploaded by the artists themselves, and some pick a
Creative Commons license. So there are two questions: can Mood Read play SoundCloud through its API, and can single
tracks join the royalty-free catalog. The answer to the second is per track, never per site.

**Under the narration: unclear, treated as no.** The API Terms say: "You must not use the SoundCloud API to ...
play sounds ... unless those actions are specifically and deliberately initiated" "by the user via an authenticated
use of your app." A track that starts on its own with each chapter is arguably not deliberately initiated. The
terms also bar "any service that aggregates and streams User Content from multiple users into an on-demand
listening service". A catalog of chapter tracks drawn from many uploaders arguably is one. No clause speaks of
mixing as such. The closest bars "any playback experience which aggregates and streams User Content with content
from other services (e.g. SoundCloud with YouTube)". Changing a track "(including adaptation, editing, excerpting,
or creating derivative works)" is barred "unless the Uploader has specifically and expressly indicated his/her
consent". Only SoundCloud's written approval would settle it. The terms leave room for "other cases that SoundCloud
may approve ... on a case by case basis".

**Between chapters: unclear, treated as no.** A track that plays by itself at a chapter break likely fails
"deliberately initiated". A tap-to-play track passes that test, but not obviously the on-demand listening bar.

**Link out from the mood card: allowed.** A plain soundcloud.com link needs no API and costs nothing. If the link
comes from the API, the terms ask for "clearly visible backlinks from the relevant sounds" "within your app to the
URL for the relevant sound on soundcloud.com (permalink_url)", plus credit to the uploader, credit to SoundCloud and
the SoundCloud logo.

**Save a playlist: not checked.** This study did not look at SoundCloud playlists.

**Caching, downloading or bundling through the API: not allowed.** "Your app must not include file-save
functionality", and "your app must not offer offline access to any User Content" "regardless of whether Uploaders
have set that User Content as allowed to be downloaded on the SoundCloud platform." A session cache "must cease to
be available, accessible or playable" "within your app at the end of that session." So API tracks cannot play
offline, nor on the lock screen without a network (A4).

**Licensing deal: unclear, treated as no.** Go content needs "a separate written agreement with SoundCloud" (see
below). Anything else the terms bar needs SoundCloud's case-by-case approval.

**A listener's paid account (Go / Go+): opens nothing.** "You must not use the SoundCloud API to access or attempt
to access any content" "that is available only to SoundCloud Go subscribers." Apps for Go content "will require
robust authentication, and a separate written agreement with SoundCloud". The API marks such tracks with the access
value "preview - user is allowed to preview a track, meaning a snippet is available"
(https://developers.soundcloud.com/docs/api/explorer/api.json). So a Go or Go+ account changes nothing for Mood
Read.

**Conditions, if the API were ever used.** The app "credits the Uploader as the creator" and "credits SoundCloud as
the source", and shows the logo "on screens where the API is used"
(https://developers.soundcloud.com/docs/api/buttons-logos). The widget is not required: playback can be "by
embedding the SoundCloud widget or using stream URLs with a custom audio player"
(https://developers.soundcloud.com/docs/api/guide). Background play is not addressed. Barred: "advertising,
sponsorship or promotion around User Content" and "in-app purchases which allow access to content or features
already available via the SoundCloud platform". A free app with no ads passes these. No changing a track unless the
uploader consents, "for example, by selecting a Creative Commons license that permits creation and distribution of
derivative works". Use "with or into any advertisement, game, video, film" needs sync licenses. No AI use of User
Content. SoundCloud's consumer Terms of Use were not read (see above).

**Costs and access.** "You need a SoundCloud Artist Pro subscription to register API applications and receive
credentials." (https://developers.soundcloud.com/docs/api/register-app). Artist Pro is "$8.25" a month, "billed
yearly for $99" (https://soundcloud.com/getstarted/pricing/). The API "is currently provided free of charge", but
SoundCloud "reserves the right to charge". The form asks for a "name, description, and website". The live page
names no approval step. A 2016 post required "an application form to request access"
(https://developers.soundcloud.com/blog/api-sign-up-changes); whether that still holds is unclear. SoundCloud
"shall have the sole right to determine whether or not an app is acceptable". Rate limits
(https://developers.soundcloud.com/docs/api/rate-limits): "on the order of 100 requests per minute" per app;
1,500 stream requests (GET /tracks/:id/stream or /streams) per 24 hours; 3,000 searches an hour; 10 downloads a
minute; approved apps get "up to 10x". 1,500 streams a day across all listeners is about 50 thirty-chapter books a
day.

**Creative Commons tracks: unclear overall, decided per track.** SoundCloud labels each track with one of
"no-rights-reserved, all-rights-reserved, cc-by, cc-by-nc, cc-by-nd, cc-by-sa, cc-by-nc-nd, cc-by-nc-sa". The API's
track search has no license filter (only q, genres, tags, bpm, duration, access and the like), so tracks are found
by hand. Per label:

- **cc-by: fits.** Attribution needs "identification of the creator(s)", "a copyright notice", "a notice that
  refers to this Public License", "a notice that refers to the disclaimer of warranties", and "a URI or hyperlink
  to the Licensed Material to the extent reasonably practicable", "in any reasonable manner based on the medium,
  means, and context" (as read in the CC BY-ND 4.0 legal code,
  https://creativecommons.org/licenses/by-nd/4.0/legalcode.en). In Mood Read: title, artist, the SoundCloud link,
  the license name and its deed link, on the mood card or a credits screen.
- **cc-by-sa: fits.** Share-alike bites only if Mood Read hands out a mixed file. The live mix on the device is not
  shared.
- **no-rights-reserved: probably fits.** The label could mean CC0 or the Public Domain Mark. Check the deed link on
  the track page.
- **cc-by-nc, cc-by-nc-sa, cc-by-nc-nd: no.** NC means "not primarily intended for or directed towards commercial
  advantage or monetary compensation" (https://creativecommons.org/licenses/by-nc/4.0/legalcode.en). The CC FAQ
  says the definition "does not turn on the type of user" (https://creativecommons.org/faq/). A free app with no
  ads may qualify, but that is unsettled, and it breaks the day the app earns money.
- **cc-by-nd: no.** It allows you to "produce and reproduce, but not Share, Adapted Material". The CC FAQ says
  "synching music in timed relation with a moving image is always considered an adaptation", and is silent on
  audio under audio.
- **all-rights-reserved: no.**

Each track also needs:

- **The license version.** Labels carry no version. Record the deed URL for each track.
- **Real authorship.** The CC FAQ warns "the licensor is not guaranteeing anything about the work, including
  whether she owns the copyright", and "You should not apply a license to material that you do not own or that you
  are not authorized to license". Check the track is an original work, not a remix, a DJ mix or a set built from
  samples.
- **No vocals (A20).** Listen to the whole track.

A written legal opinion on NC and ND, and the uploader's written confirmation for each track, would settle the
rest.

**Streaming a CC track versus bundling it.** Streaming through the API stays bound by the API Terms: no offline
play, the open questions above, credit to SoundCloud and the uploader, Artist Pro, 1,500 streams a day. A CC
license does not lift any of that. A file fetched by hand from the website and shipped as a catalog asset is
governed by the CC license instead (CC BY 4.0, 2(a)(1): "reproduce and Share the Licensed Material, in whole or in
part") and by SoundCloud's own Terms of Use, which were not read. Never fill the bundle through the API download
endpoint. To settle it: read soundcloud.com/terms-of-use in a browser, or take the same recording under the same
license from the artist's own site, or get the artist's written permission.

**Changed since spec 01.** New. Spec 01 did not cover SoundCloud.

## 4. What this means for 01.10

Recommended scope, ranked from safest:

1. **Under the narration: the royalty-free catalog and the bundled soundscapes, by default.** This is the only
   legal path under the narration. Each recording is checked against A18 before it plays.
2. **Mood-card link-outs to Spotify, YouTube Music (or YouTube), Apple Music and SoundCloud.** The mood card is the
   playing chapter's expanded row in the river. It can offer "Listen on Spotify" and the like for the named piece.
   Nothing plays inside Mood Read; the listener's own app opens. No API and no cost. The SoundCloud link is a plain
   soundcloud.com link, so it needs no API and no Artist Pro. It joins the others in 01.11.
3. **Optional: save the book's pieces as a playlist in the listener's account.**
   - Apple Music: for subscribers, once the owner holds the $99 a year Apple Developer Program.
   - YouTube: through the Data API, about 6 books a day on the default quota; an audit for more.
   - Spotify: not until extended quota, which needs a registered business with 250k monthly users.
4. **Optional: hand-picked SoundCloud tracks as catalog candidates.** CC-BY, CC-BY-SA or confirmed CC0 tracks only.
   Each is fetched by hand from the SoundCloud website or, better, the artist's own site, never through the API
   download endpoint. Each is checked by the rights-checker for authorship (an original work, not a remix or a DJ
   mix), license version (the deed URL recorded) and no vocals (A20). Each is credited on the mood card or a credits
   screen: title, artist, link, license and deed link. Then it is bundled like any other catalog track. NC, ND,
   all-rights-reserved and Go or Go+ content stay out.
5. **Not recommended: YouTube between chapters.** It is allowed only in a visible foreground player of at least
   200x200 px, never on the lock screen or in the background. That rules out lock-screen listening (A4), which
   Mood Read is built around. Spotify and Apple Music between chapters are unclear, so no.
6. **Not recommended: streaming SoundCloud through its API.** It needs Artist Pro ($99 a year), allows 1,500 streams
   a day across all listeners, never plays offline, and needs SoundCloud's case-by-case written approval for play
   under the narration or between chapters.

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
e. **Use hand-picked CC-BY / CC-BY-SA SoundCloud tracks in the royalty-free catalog?** Default: yes, as candidates
   checked track by track by the rights-checker when 01.10 builds the catalog.
f. **Is a free app with no ads "non-commercial" for CC-NC tracks?** The CC FAQ leaves it open, and the answer flips
   the day the app earns money. Default: treat as no, and leave NC tracks out.

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

SoundCloud
- API Terms of Use (effective 30 March 2024): https://developers.soundcloud.com/docs/api/terms-of-use
- API guide: https://developers.soundcloud.com/docs/api/guide
- Buttons and logos: https://developers.soundcloud.com/docs/api/buttons-logos
- Register an app: https://developers.soundcloud.com/docs/api/register-app
- Rate limits: https://developers.soundcloud.com/docs/api/rate-limits
- API explorer (access and license values): https://developers.soundcloud.com/docs/api/explorer/api.json
- API sign-up changes (2016): https://developers.soundcloud.com/blog/api-sign-up-changes
- LLM context page: https://developers.soundcloud.com/docs/llm-context
- Pricing (Artist Pro): https://soundcloud.com/getstarted/pricing/
- Did not load: Terms of Use, https://soundcloud.com/terms-of-use (an error page)
- Did not load: Creative Commons help, https://help.soundcloud.com/hc/en-us/articles/115003566748 (403)

Creative Commons
- CC BY-ND 4.0 legal code: https://creativecommons.org/licenses/by-nd/4.0/legalcode.en
- CC BY-NC 4.0 legal code: https://creativecommons.org/licenses/by-nc/4.0/legalcode.en
- FAQ: https://creativecommons.org/faq/
