// Saving a book's reference pieces as a YouTube playlist in the listener's own account (01.11, spec 01 A24's
// playlist half; D13; docs/streaming-sources.md). Spotify stays link-only (its Developer Policy III.5, until the
// owner revisits it after v1) and Apple Music playlist saving waits on the Apple Developer Program (after v1,
// README.md's Held lane 05.15); this is the only one of the three that is genuinely new infrastructure here. Mood
// Read never plays any of it: sign-in and the Data API calls only build a playlist in the listener's own account.
//
// No Expo import here on purpose (the scoring.ts / scoring-api.ts split, agents.md): `referencePiecesOf` is pure
// and `saveAsYoutubePlaylist` takes `signIn` and `fetch` as plain injected functions, so this file loads and runs
// under plain `node --test`, with no real network or OAuth call. The real sign-in (expo-auth-session against
// Google, the "moodread" scheme, the owner's client id) lives in ./youtube-auth.ts, which only the app wires in.
import type { ChapterScore, Piece } from "./types.ts";

/**
 * The book's reference pieces (D13's "In the spirit of" piece per chapter), deduped by piece id, in chapter order,
 * skipping chapters with none. Pure: no network, so the playlist's actual content is tested here, not against a
 * mock of Google's API.
 */
export function referencePiecesOf(chapterScores: readonly ChapterScore[]): Piece[] {
  const seen = new Set<string>();
  const out: Piece[] = [];
  for (const c of chapterScores) {
    const ref = c.reference;
    if (!ref || seen.has(ref.id)) continue;
    seen.add(ref.id);
    out.push(ref);
  }
  return out;
}

export type PlaylistResult =
  /** The owner hasn't registered a real OAuth client yet (`expo.extra.youtubeOAuthClientId` is still the
   *  placeholder): nothing was attempted. */
  | { kind: "not-configured" }
  /** The book has no reference piece on any chapter: nothing to add. */
  | { kind: "no-pieces" }
  /** The listener cancelled or dismissed sign-in: nothing was saved. */
  | { kind: "cancelled" }
  /** Sign-in succeeded but a later step failed (network, auth, quota): nothing was saved. */
  | { kind: "error" }
  /** The playlist was created; `matched` of `total` pieces were found on YouTube and added to it (0 counts too). */
  | { kind: "saved"; matched: number; total: number; playlistId: string };

export type SignIn = () => Promise<string | null>;
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const API = "https://www.googleapis.com/youtube/v3";

/** One piece's best-match video id, or null when the search finds nothing (skipped, not failed). */
async function findVideoId(piece: Pick<Piece, "title" | "artist">, headers: Record<string, string>, fetchImpl: FetchLike): Promise<string | null> {
  const q = encodeURIComponent(`${piece.title} ${piece.artist}`);
  const res = await fetchImpl(`${API}/search?part=snippet&type=video&maxResults=1&q=${q}`, { headers });
  if (!res.ok) return null;
  const body = (await res.json()) as { items?: { id?: { videoId?: string } }[] };
  return body.items?.[0]?.id?.videoId ?? null;
}

/**
 * Saves `pieces` as a new playlist named `bookTitle` in the listener's own YouTube account (the Data API, within
 * its free daily quota). Never crashes and never leaves a dead button: every way this can fail to produce a saved
 * playlist comes back as a calm, typed result the caller can show, including a partial result ("N of M") rather
 * than a silently dropped miss.
 *
 * `signIn` and `fetch` are injected: production code (src/lib/youtube-auth.ts, src/app/book/[id].tsx) passes the
 * real OAuth sign-in and the real `fetch`; a test passes stubs, so the request shape (method, URL, headers) is all
 * that is ever checked here — never a real network or OAuth call.
 */
export async function saveAsYoutubePlaylist(
  bookTitle: string,
  pieces: readonly Piece[],
  deps: { signIn: SignIn; fetch?: FetchLike; configured?: boolean },
): Promise<PlaylistResult> {
  if (deps.configured === false) return { kind: "not-configured" };
  if (pieces.length === 0) return { kind: "no-pieces" };

  const fetchImpl = deps.fetch ?? fetch;

  let token: string | null;
  try {
    token = await deps.signIn();
  } catch {
    return { kind: "error" };
  }
  if (!token) return { kind: "cancelled" };

  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  try {
    // Every piece is searched; a piece with no match is skipped, never a failure (one odd piece never blocks the
    // rest). The playlist is created either way, so a whole-book miss still reads as "Added 0 of M", not a dead end.
    const videoIds: string[] = [];
    for (const piece of pieces) {
      const id = await findVideoId(piece, headers, fetchImpl);
      if (id) videoIds.push(id);
    }

    const playlistRes = await fetchImpl(`${API}/playlists?part=snippet`, {
      method: "POST",
      headers,
      body: JSON.stringify({ snippet: { title: bookTitle } }),
    });
    if (!playlistRes.ok) return { kind: "error" };
    const playlist = (await playlistRes.json()) as { id?: string };
    if (!playlist.id) return { kind: "error" };

    // A partial result ("Added N of M pieces") is reported either way, never a silently dropped miss.
    let added = 0;
    for (const videoId of videoIds) {
      const itemRes = await fetchImpl(`${API}/playlistItems?part=snippet`, {
        method: "POST",
        headers,
        body: JSON.stringify({ snippet: { playlistId: playlist.id, resourceId: { kind: "youtube#video", videoId } } }),
      });
      if (itemRes.ok) added++;
    }
    return { kind: "saved", matched: added, total: pieces.length, playlistId: playlist.id };
  } catch {
    return { kind: "error" };
  }
}
