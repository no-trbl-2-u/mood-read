// Plain search link-outs for the mood card's reference piece (01.11, spec 01 A24, D13;
// docs/streaming-sources.md): every service here allows a free link straight to a search, with no API and no
// quota. Mood Read never looks up the exact track (that costs quota none of these services give for free) and
// never plays what the link opens — only the listener's own app does, on their own tap.
export type StreamingLink = { service: string; label: string; url: string };

const query = (piece: { title: string; artist: string }): string => encodeURIComponent(`${piece.title} ${piece.artist}`);

/**
 * One plain search URL per service, in the order the mood card shows them: Spotify, YouTube, YouTube Music, Apple
 * Music, SoundCloud. `service` is the lowercase, hyphenated id used in the mood card's testIDs
 * (`reference-link-<service>`); `label` is the plain service name shown to the listener (no brand icon, D13's
 * sibling rule, Bearings: Lucide only).
 */
export function streamingLinks(piece: { title: string; artist: string }): StreamingLink[] {
  const q = query(piece);
  return [
    { service: "spotify", label: "Spotify", url: `https://open.spotify.com/search/${q}` },
    { service: "youtube", label: "YouTube", url: `https://www.youtube.com/results?search_query=${q}` },
    { service: "youtube-music", label: "YouTube Music", url: `https://music.youtube.com/search?q=${q}` },
    { service: "apple-music", label: "Apple Music", url: `https://music.apple.com/search?term=${q}` },
    { service: "soundcloud", label: "SoundCloud", url: `https://soundcloud.com/search?q=${q}` },
  ];
}
