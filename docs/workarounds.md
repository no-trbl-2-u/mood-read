# Workarounds for the blocked services: music and Audible

The owner's report for chunk 01.13 (closes A26). The streaming study (docs/streaming-sources.md, chunks 01.9 and
01.12) found that Spotify, YouTube, Apple Music and Audible will not let their audio play inside Mood Read. This
report asks the next question: what else gives the listener the same thing? Two things are wanted. One is music under
the narration. The other is a listener's Audible books in Mood Read. It builds nothing; it feeds 01.10, which picks
the music source.

Only compliant routes count. agents.md rule 6 says Mood Read decrypts nothing (no AAX/AAXC) and plays nothing
without a license that allows it. A7 says Audible-owned books reach the library only as DRM-free files the listener
brings. A18 says every piece Mood Read plays carries a license that allows it. So this report leaves out, without
weighing them: decrypting AAX/AAXC, activation bytes, ripping or recording a stream, scraping, and unofficial APIs.

Every verdict below comes from the rights-checker. "Unclear" is treated as no, as agents.md requires. Every term was
read on 2026-10-23.

Already planned elsewhere, so linked here and not redone: mood-card link-outs (01.11), DRM-free imports with the
AAX/AAXC note (01.6, A7), and CC-BY / CC-BY-SA tracks in the catalog (D7).

## 1. Bottom line

- Nothing makes the mainstream catalogues (Spotify, YouTube, Apple Music) play inside Mood Read under the narration.
- Music under the narration can come from three clean places: Creative Commons tracks (Kevin MacLeod first), music
  generated on a tier that assigns the rights (AIVA Pro, or Suno Pro / Premier), or a composer commissioned with a
  written assignment.
- Companion mode is the way to hear a listener's own Spotify, YouTube Music Premium or Apple Music, or their Audible
  book, alongside Mood Read. Each service plays in its own app; Mood Read only coexists and links out.
- Companion mode has a cost. The narration loses its lock-screen controls (A4) while it is on, and the listener has
  two apps to control. So it is a mode the listener chooses, not the default.
- For Audible books inside Mood Read, the only clean routes are DRM-free stores (Libro.fm) and public domain
  (LibriVox, Project Gutenberg). There is no Audible API, and stripping the DRM is forbidden by Audible's terms.
- Feed.fm is the only lead for licensed mainstream music, and it needs a quote first.

## 2. Summary tables

### Music under the narration

| Candidate | Verdict | Cost | Build | How close it comes |
|---|---|---|---|---|
| Kevin MacLeod / Incompetech (CC BY 4.0) | Allowed | Free (credit needed) | Bundle files, Credits screen | Full: bundled, loopable, offline, lock screen |
| Free Music Archive, single CC BY / BY-SA / CC0 tracks | Allowed per track; site-level unclear | Free | Bundle, per-track checks (D7) | Full, for the tracks that pass |
| Pixabay Music | Unclear | Free | Bundle | Full, if Pixabay confirms |
| Epidemic Sound Partner API | Unclear | Custom (paid Scale / Enterprise) | API, 60-minute cache | Partial; offline not addressed |
| Soundstripe API | Unclear | Not published | Reseller agreement, API | Unknown |
| Jamendo Licensing (International) | Unclear | Not published, per track | Bundle | Full, if Jamendo confirms |
| Artlist, Uppbeat | Unclear (pages would not load) | Not read | Not read | Unknown |
| Feed.fm | Unclear (strongest B2B lead) | Not published | SDK; community React Native bridge | Radio-like; mainstream labels possible |
| Tuned Global | Unclear | Contract and quote | API | Unknown |
| 7digital / Songtradr | Unclear (no primary page) | Not found | Not found | Unknown |
| IMSLP recordings, CC0 / CC BY / CC BY-SA files | Allowed | Free (credit for BY) | Bundle | Full, classical |
| IMSLP files tagged "public domain" | Not allowed as a class | Free | None | None |
| Musopen recordings | Unclear | Free | Bundle | Best classical fit, once confirmed |
| Internet Archive generally | Unclear per item | Free | Bundle | Per item |
| AIVA Pro | Allowed | EUR 33/month + VAT, billed annually | Generate, download, bundle | Full; instrumental |
| Suno Pro / Premier | Allowed | Pricing page not read | Generate instrumental only, bundle | Full; vocals must be avoided |
| Mubert | Unclear | $149.29/month (Render Business); API from $199/month | Bundle or API | Unknown |
| Soundraw | Unclear, leans no | Subscription | Bundle | Lost if the subscription ends |
| Stable Audio | Unclear | Not read in full | Bundle | Unknown |
| Udio | Unclear (terms rendered no text) | Not read | Bundle | Unknown |
| Commissioned composer | Allowed with a written assignment | No source | Commission, bundle | Full; made to fit |
| Companion mode (own Spotify / YouTube Music Premium / Apple Music) | Allowed with plain links only | $0 to Mood Read; the listener's subscription | Bed-only mode, mixWithOthers | The listener's own music, not tied to the chapter |

### A listener's Audible books in Mood Read

| Candidate | Verdict | Cost | Build | How close it comes |
|---|---|---|---|---|
| Stripping DRM (AAX/AAXC) | Not allowed | - | Never | - |
| Official Audible API or partner | Not allowed (none exists) | - | - | - |
| Companion mode over Audible's own playback | OS allowed; whether Audible keeps playing is unclear (device test) | $0 | Bed-only mode, ~2-4 days; with manual chapters ~3-6 days | High for music under the book; two apps |
| Following Audible's chapters automatically | iOS not allowed; Android unclear (= no) | - | - | - |
| Chapters followed by hand or a timer | Allowed | $0 | ~2 days | Close, with effort from the listener |
| Libro.fm | Allowed | Per title or monthly credit | 01.6 import only | Full, for books bought there |
| LibriVox | Allowed | $0 | Import now; catalog later | Full, classics only |
| Project Gutenberg audio | Allowed per file | $0 | Import | Full, classics only |
| BookFunnel (author-direct) | Allowed where downloads are enabled | Per title | Import | Full, for those books |
| Downpour | Unclear | - | Import | Unknown |
| Humble Bundle audiobooks | Unclear | - | Import | Occasional at best |
| Kobo | Not allowed (no export route) | - | - | Companion only |
| Google Play Books audiobooks | Unclear (= no) | - | - | Companion only |
| Chirp | Not allowed (app-only) | - | - | Companion mode works |
| Libby / OverDrive | Not allowed (no export) | - | - | Companion mode possible |
| Hoopla | Unclear (= no) | - | - | - |
| Amazon Associates affiliate links | Unclear (needs app approval) | Earns; costs nothing | Tagged links | 0 (a store link) |
| Plain "Open in Audible" link | Unclear (low risk) | $0 | ~1 day | Low |

## 3. Music: the alternatives

Bottom line from the rights-checker: nothing makes the mainstream catalogues play inside Mood Read under the
narration. Clearly allowed are per-track Creative Commons, AI music on a tier that assigns the rights, and a
commissioned composer with a written assignment. Everything else is unclear, so no, until its question is answered.

Every piece still needs the vocals check (A20) before it ships.

### A. Royalty-free and production libraries

**Kevin MacLeod / Incompetech: allowed.** The music is "Licensed under Creative Commons: By Attribution 4.0"
(https://incompetech.com/music/royalty-free/faq.html). It "Requires that you credit the music"
(https://incompetech.com/music/royalty-free/licenses/). CC BY 4.0 section 2(a)(1) lets Mood Read "reproduce and Share
the Licensed Material". The credit can go on a Credits screen: "Most commonly, credits are placed on a "Credits"
screen". Apps are not named; the CC BY legal code governs. A paid Standard License drops the credit; its price is not
shown.
- Cost: free.
- Build: bundle the files and add a Credits screen.
- Closeness: full. Bundled, loopable, offline, and on the lock screen.
- Condition: check each track for vocals (A20).

**Free Music Archive: allowed per single track only.** Allowed for a single CC BY, CC BY-SA or CC0 track. The site as
a whole is unclear: "FMA cannot license original work to you for commercial, private, or other use." Its public-domain
labels "should not be considered authoritative" (https://freemusicarchive.org/License_Guide).
- Cost: free. Build: bundle, with the same per-track checks as D7. Closeness: full, for tracks that pass.

**Pixabay Music: unclear.** Terms section 5 (updated 20 Oct 2026): "You cannot sell or distribute the Content (either
in digital or physical form) on a Standalone basis". Standalone means "where no creative effort has been applied to
the Content". Section 8: "Bulk, large-scale or systematic copying of Content is strictly prohibited"
(https://pixabay.com/service/terms/).
- Cost: free.
- What would settle it: Pixabay's written word that a track bundled and mixed on the device is not Standalone.

**Epidemic Sound Partner API: unclear.** The free plan is "Prototyping only — you cannot go live on this plan"
(https://developers.epidemicsound.com/). Caching is allowed "temporarily for performance, for up to 60 minutes"
(https://developers.epidemicsound.com/docs/). Going live needs a paid Scale or Enterprise plan. It is aimed at
creator and video tools. Offline play is not addressed, and the Partner Agreement is not public.
- Cost: custom, by download volume.
- What would settle it: the Partner Agreement, and its word on offline play.

**Soundstripe API: unclear.** It is for "platforms, tools, and services bring[ing] Soundstripe's music library to
millions of creators", and access "starts with a conversation" (https://www.soundstripe.com/api). Trial keys are
"watermarked and expire after 30 days".
- Cost: a reseller agreement; price not published.
- What would settle it: the reseller agreement itself.

**Jamendo Licensing (Individual, International tier): unclear.** The International tier is for apps "available and
used internationally". But "The communication of the track to the public without synchronization is prohibited", and
licenses "cannot be sub-licensed" (https://support-licensing.jamendo.com/individual-licenses). One track per project,
perpetual.
- Cost: not published.
- What would settle it: Jamendo's word that looping under an audiobook counts as synchronized, and a per-track price.

**Artlist, Uppbeat: unclear.** Their pages returned errors (403 and 429). Someone should read the licences in a
browser.

### B. B2B licensed streaming

**Feed.fm: unclear, but the strongest B2B lead.** Its docs say you can "stream Feed.fm as a soundtrack to your video
or audio narration", and "Skip availability varies by track and by geographic area"
(https://docs.feed.fm/docs/SDK-Overview). Offline stations work "through our iOS and Android SDKs only", and they
expire unless the SDK reaches the server (https://docs.feed.fm/docs/Recipes/offline). It works like radio: stations
and skip limits. No page confirms one named track looped per chapter. Its catalogues include "Major label", "Indie
label" and "Royalty free". The React Native bridge is community-made.
- Cost: not published.
- Closeness: partial. Music under the narration, but radio-like rather than the chapter's own piece.
- What would settle it: a quote, and Feed.fm's written word that one track can loop per chapter.

**Tuned Global: unclear.** "Integrate licensed music into apps and digital products" (https://www.tunedglobal.com/).
Narration use is not mentioned.
- Cost: a contract and a quote.

**7digital / Songtradr: unclear.** No primary page was found.

### C. Public-domain and open recordings

Both the composition and the recording must be free, in every country where Mood Read is offered.

**IMSLP recordings: allowed for CC0, CC BY and CC BY-SA files.** Files tagged "public domain" are not allowed as a
class. That tag means public domain in Canada, published 1964 or earlier: "so long as the recordings are in the
public domain in Canada" (https://imslp.org/wiki/IMSLP:Licensing_Policy_and_Guidelines). NC is deprecated there, and
ND is not allowed.
- Cost: free, with credit for BY. Build: bundle. Closeness: full, for classical pieces.

**Musopen recordings (Brahms, Beethoven, Tchaikovsky symphonies, string quartets, Goldberg Variations): unclear.**
The Internet Archive item says "Public Domain Mark 1.0" (https://archive.org/details/MusopenCollectionAsFlac), but
the uploader set that. The Internet Archive "does not make guarantees as to the copyright status of items"
(https://help.archive.org/help/rights/). musopen.org returned 403.
- Cost: free. Closeness: the best classical fit. Mostly instrumental; check each.
- What would settle it: Musopen's own page for each recording, or its written word.

**Internet Archive generally: unclear per item,** until the rights are confirmed at the source.

### D. Generated or commissioned music

**AIVA Pro: allowed.** "Licensor hereby assigns, grants and conveys all copyrights of the MIDI and/or Audio
Composition to Licensee" (https://www.aiva.ai/legal/1, section 3). The Pro plan says "Copyright owned by YOU" and
"Full monetization" (https://www.aiva.ai/pricing). The Free tier is not enough: AIVA owns the music, credit is needed
and there is no monetisation. The Standard tier covers only YouTube, Twitch, TikTok and Instagram.
- Cost: EUR 33 a month plus VAT, billed annually. 300 downloads a month.
- Conditions: download while on Pro, and keep the licence record.
- Build: generate, download, bundle. Closeness: full. Instrumental by nature; still check each piece.

**Suno Pro / Premier: allowed.** "Suno hereby assigns to you all of its right, title and interest in and to any
Output owned by Suno", and download rights "are perpetual" (https://suno.com/terms, revised 10 Aug 2026).
- Conditions: only downloaded output may be used commercially. Free and Basic are "personal and non-commercial". No
  use "to compete with Suno". Remixes are non-commercial. There is no warranty against third-party infringement.
- Suno makes vocals by default: generate instrumental only, and check each piece (A20).
- Cost: the pricing page was not read. Build: bundle.

**Mubert: unclear.** Render Business ($149.29 a month) is for "apps, games"; the API starts at $199 a month. But
"Tracks cannot be redistributed as standalone music content". After cancelling, "You cannot use previously generated
tracks in new projects". The footer says "licensed by Mubert(R) Inc only for personal use"
(https://mubert.com/render/pricing, https://mubert.com/api).
- What would settle it: a written licence for an app.

**Soundraw: unclear, leaning no.** Its "Not OK" list includes "Distributing your music without modifying". And "you
can only keep your content published while your SOUNDRAW subscription is active" (https://soundraw.io/license).

**Stable Audio: unclear.** The Community License is "For ... creators with less than $1M in annual revenue", and
"you own outputs" (https://stability.ai/license). Only the summary was read; the full text and stableaudio.com/terms
did not load.
- What would settle it: reading the full licence text.

**Udio: unclear.** Its terms pages rendered no text.

**Commissioned composer: allowed, with a written assignment** or a perpetual worldwide license that covers app
distribution, looping and offline play. Calling it work-for-hire does not clearly work: "If a work fails to satisfy
any of these requirements, it is not a work made for hire". Those categories cover music only "as a part of a motion
picture or other audiovisual work" (https://www.copyright.gov/circs/circ30.pdf).
- Cost: no source; quotes needed.
- Condition: ask the composer about collecting-society registration.
- Closeness: full, and made to fit.

### E. Companion mode for music

The listener plays their own service in its own app, and Mood Read plays alongside. See section 5 for the platform
rules and the cost. In short, per service:

- **Spotify: allowed** if Mood Read uses no Spotify Platform at all (a plain search link; no SDK, API or remote
  control). **Not allowed** if it controls Spotify through the SDK or App Remote. **Unclear** if the link comes from
  the Web API.
- **YouTube Music: allowed** for Premium members through a plain link. Free listeners lose the music when YouTube
  Music goes to the background.
- **Apple Music: allowed** with a plain link and no MusicKit. **Unclear (so no)** if Mood Read starts or controls
  playback through MusicKit or the system player.
- The companion music is not tied to the chapter. The listener picks it in the other app.

## 4. Audible: the alternatives

Bottom line from the rights-checker: companion mode is allowed by Audible's terms. Audible plays the book in its own
app; Mood Read plays only its own licensed bed alongside. Whether Audible keeps playing needs a real-device test.
Libro.fm (every title DRM-free) and LibriVox (public domain) are the clean import routes. There is no public Audible
API.

### Why stripping DRM is out

**Not allowed.** The only way to get "my Audible books inside Mood Read" as files is to strip the DRM, and Audible's
terms forbid it, for the listener too. Audible Conditions of Use (updated 2025-09-10), Content Restrictions, clause
(iv): "You may not ... (iv) attempt to disable, bypass, modify, defeat, or otherwise circumvent any digital rights
management or other protection system applied to Content or used as part of the Service"
(https://www.audible.com/legal/conditions-of-use). The License (updated 2025-02-18) adds: "No purchased content may be
reproduced, duplicated, copied, sold, resold, visited, or otherwise exploited"
(https://www.audible.com/legal/license-agreement). So the AAX/AAXC import note must not suggest converting. See owner
decision (a) below.

### Official API or partner program

**Not allowed: none exists.** The License grants only a "limited, non-exclusive, non-transferable, non-sublicensable
license to access and make personal and non-commercial use". It forbids "any use of data mining, robots, or similar
data gathering and extraction tools".

### Companion mode with Audible

**Allowed by Audible's terms; whether Audible keeps playing is unclear until tested on a device.** Audible's
restrictions cover only what is done to Content: to "transfer, copy or display Content", to "sell, rent, lease,
distribute, or broadcast any Content", or to "circumvent any digital rights management". Nothing in them covers other
apps playing at the same time. Mood Read never captures, records or reroutes Audible's output, and the listening is
personal.
- Cost: $0. Build: a bed-only mode, about 2-4 days.
- Closeness: high for hearing music under the book. Two apps to control.
- Details, the device test and chapter following: section 5.

### DRM-free stores and public-domain libraries

**Libro.fm: allowed.** "Libro.fm is one of the few places where every audiobook is DRM-free", and "you can listen to
your audiobooks anytime, anywhere, on any device"
(https://support.libro.fm/support/solutions/articles/48000695425-can-i-listen-to-my-audiobooks-on-multiple-devices-).
Books come as MP3 in zip folders or a single M4B, per https://libro.fm/guide. That guide and the terms returned 403;
the formats come from search results.
- Cost: per title, or a monthly credit.
- Build: only the 01.6 import (unzip or folder import; M4B chapter atoms).
- Closeness: the full experience, for books bought there.
- Affiliate: through Awin, "commissions (a percentage of revenue) on qualifying sales"
  (https://support.libro.fm/support/solutions/articles/48001200043-what-is-the-libro-fm-affiliate-program-). Links
  inside the app are unclear until affiliates@libro.fm confirms them.

**LibriVox: allowed.** "All our audio is in the public domain, so you may use it for whatever purpose you wish."
(https://librivox.org/pages/about-librivox/). But "all our recordings are public domain in the USA, but not
necessarily in other countries" (https://librivox.org/pages/public-domain/).
- Cost: $0. Build: import now; a catalog later through its public API (not checked).
- Closeness: the full experience, classics only. Volunteer narration varies in quality.

**Project Gutenberg audio: allowed per file.** "we do not claim a right to prevent you from copying, distributing,
performing, displaying or creating derivative works ... as long as all references to Project Gutenberg are removed"
(https://www.gutenberg.org/policy/license.html). The trademark condition applies only if Mood Read redistributes the
files. "If you are outside the United States, check the laws of your country".
- Cost: $0. Build: import.

**BookFunnel (author-direct): allowed where the author enabled downloads.** "When you upload a new audiobook to
BookFunnel, DRM-free MP3 downloads are optional." and "Most readers will listen to your audiobook in the BookFunnel
app." (https://authors.bookfunnel.com/help/how-does-bookfunnel-deliver-audiobooks).
- Build: import. Closeness: full, for those books.

**Downpour: unclear.** The site returned 429 and 404; only secondary sources say it is DRM-free.

**Humble Bundle audiobooks: unclear.** Only 2014 coverage was found; occasional at best.

**Kobo: not allowed (no export route).** The export article covers only "EPUB or PDF", and "Most books are protected
by Digital Rights Management (DRM)"
(https://help.kobo.com/hc/en-us/articles/360019527954-Download-books-from-your-Kobo-account-to-export-to-another-device-or-app).

**Google Play Books audiobooks: unclear (= no).** There is no official export page.

**Chirp: not allowed (app-only).** "download it in the app for offline listening"; "Stream your audiobook via the
Chirp app or site" (https://www.chirpbooks.com/how-it-works). Companion mode works as with Audible.

**Libby / OverDrive: not allowed (no export).** "On November 13, 2024, we retired the MP3 audiobook format from
OverDrive library websites" (https://help.overdrive.com/en-us/2324.htm). Companion mode is possible.

**Hoopla: unclear (= no).** Its terms could not be read.

### Linking out to Audible

**Amazon Associates affiliate links: unclear.** The Associates Policies (updated 2026-04-14) say: "You will not use
any Program Content or Special Link, or otherwise link to an Amazon Site, on or in connection with: (a) any
client-side software application ... on any device, including computers, mobile phones, tablets ... (other than
Approved Mobile Applications)" (https://affiliate-program.amazon.com/help/operating/policies). The Audible page pays
"$5 for eligible Audible free trial memberships" and "$10 for eligible paid Audible memberships"
(https://www.audible.com/ep/affiliates).
- Conditions: Amazon's approval of the app. The app must be free and in a store, show no WebView of Amazon pages, and
  not imitate Amazon shopping.
- Cost: nothing; it earns. Closeness: 0, since it is only a store link.

**Plain "Open in Audible" link: unclear, low risk.** Audible's help says to "tap the Share icon" and send the link
through any app (https://help.audible.com/s/article/share-a-title?language=en_US). The Amazon.com Conditions of Use
hyperlink clause could not be read (503): https://www.amazon.com/gp/help/customer/display.html?nodeId=508088.
- Conditions: no logos beyond the name, no WebView.
- Cost: $0. Build: about 1 day. Closeness: low.
- What would settle it: reading the Amazon hyperlink clause.

## 5. Companion mode

Companion mode serves both needs. The listener plays their music service, or their Audible book, in that service's
own app. Mood Read plays alongside it, and plays only what it is licensed to play.

**What the phone allows: allowed.**
- iOS: "If you set this option, your app mixes its audio with audio playing in background apps, such as the Music
  app."
  (https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/mixwithothers).
  And "Clearing this option and then activating your session interrupts other audio sessions."
- Android: "Two or more Android apps can play audio to the same output stream simultaneously, and the system mixes
  everything together." (https://developer.android.com/media/optimize/audio-focus). Android 12 and later fade the
  first app only when it "successfully requested audio focus with AUDIOFOCUS_GAIN" and "is not playing audio with
  content type CONTENT_TYPE_SPEECH", and a second app asks for the same focus. A player marked CONTENT_TYPE_SPEECH is
  spared the fade.
- So Mood Read would use iOS `.playback` with mixWithOthers. On Android it would not request AUDIOFOCUS_GAIN (it
  would skip focus, or use GAIN_TRANSIENT_MAY_DUCK). That goes against Android's guidelines, but the system does not
  block it.

**The cost: lock-screen controls.** Expo's docs say: "For lock screen controls to work correctly, interruptionMode
must be set to doNotMix" (https://docs.expo.dev/versions/latest/sdk/audio/). So while companion mode is on, the
narration loses its lock-screen controls (A4). That makes it a mode the listener chooses, never the default. The
listener also has two apps to control and sets both volumes.

**The per-service rules.**
- Plain links only. No SDK, no API, no remote control, no MusicKit.
- No ducking of the other app (no duckOthers) and no control of its playback. mixWithOthers only.
- Spotify: "If you use or otherwise access the Spotify Platform, you will be deemed to have accepted the Developer
  Agreement" (https://developer.spotify.com/terms), and Policy III.7 still applies. The consumer terms say "personal,
  non-commercial use" and have no clause on mixing (https://www.spotify.com/us/legal/end-user-agreement/, updated
  4 Sep 2026). Whether Spotify's free tier plays in the background was not checked.
- YouTube Music: "With a YouTube Music Premium membership, you can listen to music and podcasts uninterrupted"
  (https://support.google.com/youtubemusic/answer/6313552). No API, no embed. Free listeners lose the music in the
  background.
- Apple Music: the consumer terms say "only for personal, noncommercial purposes" and have no clause on mixing
  (https://www.apple.com/legal/internet-services/itunes/us/terms.html, updated 14 Sep 2026). DPLA 3.3.6(D) applies as
  in 01.9.

**Audible needs a device test.** How Audible handles audio focus is not documented. Test on both platforms: which app
starts first, pausing Audible, a phone call, and Bluetooth.

**Chapters are followed by hand or by a timer.**
- Following Audible's chapters automatically on iOS: **not allowed.** There is no API. MPNowPlayingInfoCenter is "An
  object for setting the Now Playing information for media that your app plays"
  (https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter).
- On Android: **unclear, so no.** MediaSessionManager.getActiveSessions "requires the
  android.Manifest.permission#MEDIA_CONTENT_CONTROL permission ... You may also retrieve this list if your app is an
  enabled notification listener using the NotificationListenerService APIs"
  (https://developer.android.com/reference/android/media/session/MediaSessionManager). Play allows sensitive
  permissions only when "necessary for the app's core functionalities as promoted in your Google Play listing"
  (https://support.google.com/googleplay/android-developer/answer/16558241). Notification access reads every app's
  notifications. Whether Audible exposes chapters is unknown. And Audible's ban on "data gathering and extraction
  tools" may reach it.
- The allowed fallback: the listener taps "next chapter" in Mood Read, or a chapter timer runs from durations the
  listener enters. About 2 days.
- Chapter titles may come from what the listener types or picks: **allowed.** The research must never fetch
  audible.com or amazon.com pages. Narrated chapter lengths differ from print, so a timer needs the listener's own
  durations.

**Cost and build.** $0. A bed-only mode (no narration track) is about 2-4 days; with manual chapter following, about
3-6 days. It works the same way with Libby and Chirp.

## 6. Ranked recommendations

### Music, for 01.10

1. Kevin MacLeod CC BY, bundled.
2. Hand-picked CC0, CC BY and CC BY-SA tracks from Free Music Archive, IMSLP (CC files only) and SoundCloud (D7).
3. AIVA Pro generated instrumentals. Suno Pro / Premier as the fallback, instrumental only.
4. A commissioned composer with a written assignment (quotes needed).
5. Musopen orchestral recordings, once each one is confirmed.

Later: companion mode as an optional add-on, per service. Feed.fm is the only lead for licensed mainstream music.

### Audible

1. Companion mode with manual chapter following. Allowed; needs the device test; $0; about 3-6 days. Works with Libby
   and Chirp too.
2. Libro.fm as "buy here instead". Allowed; in-app affiliate links unclear.
3. LibriVox and Project Gutenberg. Allowed, $0, public domain in the US.
4. BookFunnel and other author-direct sales, where downloads are enabled.
5. A plain "Open in Audible" link. Unclear until the Amazon hyperlink clause is read; tagged links need Associates
   app approval.

## 7. Owner decisions this raises

a. **The "converted copies" wording in spec 01.** Spec 01 says Mood Read plays "their own converted Audible downloads
   included", and suggests telling listeners to bring "their own converted copies". Audible's clause (iv) forbids
   that conversion. Recommended default: drop that wording. The AAX/AAXC import note points to DRM-free stores and
   companion mode instead. (The lead fixes the spec text when this chunk closes.)

b. **Companion mode as a chunk of its own:** a bed-only mode, mixWithOthers, manual chapter following, and a device
   test with Audible. Recommended default: yes, plotted after 01.7's soundscapes.

c. **Generated or commissioned music:** subscribe to AIVA Pro (EUR 33 a month) to generate the instrumental catalog,
   or commission a composer. Recommended default: decide at 01.10. Start with Kevin MacLeod CC BY and hand-picked CC
   tracks, which are free.

d. **Ask Feed.fm for a quote** for licensed mainstream music. Recommended default: no, not before v1.

e. **Affiliate links in the app:** Libro.fm (ask affiliates@libro.fm) and Amazon Associates app approval. Recommended
   default: not now; plain links only.

f. **A Credits screen for CC BY music.** It is needed once any CC BY track ships. Recommended default: yes, as part
   of 01.10.

## 8. Sources

All read on 2026-10-23.

Music libraries and services:
- https://incompetech.com/music/royalty-free/faq.html
- https://incompetech.com/music/royalty-free/licenses/
- https://freemusicarchive.org/License_Guide
- https://pixabay.com/service/terms/
- https://developers.epidemicsound.com/
- https://developers.epidemicsound.com/docs/
- https://www.soundstripe.com/api
- https://support-licensing.jamendo.com/individual-licenses
- https://docs.feed.fm/docs/SDK-Overview
- https://docs.feed.fm/docs/Recipes/offline
- https://www.tunedglobal.com/
- https://imslp.org/wiki/IMSLP:Licensing_Policy_and_Guidelines
- https://archive.org/details/MusopenCollectionAsFlac
- https://help.archive.org/help/rights/
- https://www.aiva.ai/legal/1
- https://www.aiva.ai/pricing
- https://suno.com/terms
- https://mubert.com/render/pricing
- https://mubert.com/api
- https://soundraw.io/license
- https://stability.ai/license
- https://www.copyright.gov/circs/circ30.pdf

Companion mode and platforms:
- https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/mixwithothers
- https://developer.android.com/media/optimize/audio-focus
- https://docs.expo.dev/versions/latest/sdk/audio/
- https://developer.spotify.com/terms
- https://www.spotify.com/us/legal/end-user-agreement/
- https://support.google.com/youtubemusic/answer/6313552
- https://www.apple.com/legal/internet-services/itunes/us/terms.html
- https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter
- https://developer.android.com/reference/android/media/session/MediaSessionManager
- https://support.google.com/googleplay/android-developer/answer/16558241

Audible and audiobook stores:
- https://www.audible.com/legal/conditions-of-use
- https://www.audible.com/legal/license-agreement
- https://affiliate-program.amazon.com/help/operating/policies
- https://www.audible.com/ep/affiliates
- https://help.audible.com/s/article/share-a-title?language=en_US
- https://support.libro.fm/support/solutions/articles/48000695425-can-i-listen-to-my-audiobooks-on-multiple-devices-
- https://support.libro.fm/support/solutions/articles/48001200043-what-is-the-libro-fm-affiliate-program-
- https://librivox.org/pages/about-librivox/
- https://librivox.org/pages/public-domain/
- https://www.gutenberg.org/policy/license.html
- https://authors.bookfunnel.com/help/how-does-bookfunnel-deliver-audiobooks
- https://help.kobo.com/hc/en-us/articles/360019527954-Download-books-from-your-Kobo-account-to-export-to-another-device-or-app
- https://www.chirpbooks.com/how-it-works
- https://help.overdrive.com/en-us/2324.htm

Pages that would not load, or loaded without their terms:
- Artlist and Uppbeat licence pages (403 / 429).
- musopen.org (403).
- The full Stable Audio licence text and stableaudio.com/terms.
- Udio's terms pages (no text rendered).
- https://libro.fm/guide and Libro.fm's terms (403; formats taken from search results).
- https://www.amazon.com/gp/help/customer/display.html?nodeId=508088 (503).
- Downpour (429 / 404). Hoopla's terms.
- Suno's pricing page was not read. No primary page was found for 7digital / Songtradr.
