import assert from "node:assert/strict";
import { test } from "node:test";

import { referencePiecesOf, saveAsYoutubePlaylist, type FetchLike } from "./youtube-playlist.ts";
import type { ChapterScore, Piece } from "./types.ts";

const piece = (n: number): Piece => ({ id: `p${n}`, title: `Theme ${n}`, artist: `Composer ${n}`, kind: "score", vocals: "none", moodTags: ["tension"] });
const ref = (n: number): Piece => ({ id: `ref${n}`, title: `Famous ${n}`, artist: `Famous Artist ${n}`, kind: "score", vocals: "none", moodTags: ["tension"] });

function chapter(index: number, reference?: Piece): ChapterScore {
  return {
    mood: { chapterIndex: index, chapterTitle: `Chapter ${index}`, emotions: [], sources: [], coverage: "scored", model: "m", version: "v", scoredAt: 1 },
    pieces: [piece(index)],
    playlist: { chapterIndex: index, piece: `p${index}`, alternates: [], pick: "auto" },
    reference,
  };
}

// ---- referencePiecesOf (pure, no network) --------------------------------------------------------------------

test("A24: the book's reference pieces, in chapter order, skipping chapters with none", () => {
  const chapters = [chapter(0, ref(1)), chapter(1), chapter(2, ref(2))];
  assert.deepEqual(referencePiecesOf(chapters).map((p) => p.id), ["ref1", "ref2"]);
});

test("A24: a reference repeated across chapters is deduped by piece id, kept at its first chapter", () => {
  const chapters = [chapter(0, ref(1)), chapter(1, ref(1)), chapter(2, ref(2))];
  assert.deepEqual(referencePiecesOf(chapters).map((p) => p.id), ["ref1", "ref2"]);
});

test("A24: no chapter names a reference: nothing to add", () => {
  assert.deepEqual(referencePiecesOf([chapter(0), chapter(1)]), []);
  assert.deepEqual(referencePiecesOf([]), []);
});

// ---- saveAsYoutubePlaylist (the thin OAuth + Data API glue, smoke-tested with a mocked fetch) -----------------

/** A fetch stub that answers each call shape (method + URL) with a canned response, and keeps every call made. */
function fakeFetch(answers: { search?: string | null; playlistId?: string; itemOk?: boolean } = {}): { fetch: FetchLike; calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/search")) {
      const videoId = answers.search === undefined ? "vid-1" : answers.search;
      return new Response(JSON.stringify({ items: videoId ? [{ id: { videoId } }] : [] }), { status: 200 });
    }
    if (url.includes("/playlists?")) {
      return new Response(JSON.stringify({ id: answers.playlistId ?? "playlist-1" }), { status: 200 });
    }
    if (url.includes("/playlistItems?")) {
      return new Response("{}", { status: answers.itemOk === false ? 500 : 200 });
    }
    throw new Error(`unexpected URL in test: ${url}`);
  };
  return { fetch, calls };
}

test("A24: not configured, or no pieces: nothing is attempted, and sign-in is never called", async () => {
  let signInCalls = 0;
  const signIn = async () => {
    signInCalls++;
    return "token";
  };
  assert.deepEqual(await saveAsYoutubePlaylist("Book", [piece(1)], { signIn, configured: false }), { kind: "not-configured" });
  assert.deepEqual(await saveAsYoutubePlaylist("Book", [], { signIn }), { kind: "no-pieces" });
  assert.equal(signInCalls, 0);
});

test("A24: a cancelled or dismissed sign-in saves nothing, and is never treated as a crash", async () => {
  const result = await saveAsYoutubePlaylist("Book", [piece(1)], { signIn: async () => null });
  assert.deepEqual(result, { kind: "cancelled" });
});

test("A24: a sign-in that throws comes back as a calm error, never an unhandled rejection", async () => {
  const result = await saveAsYoutubePlaylist("Book", [piece(1)], { signIn: async () => { throw new Error("boom"); } });
  assert.deepEqual(result, { kind: "error" });
});

test("A24: a full match — one search, one playlist, one playlistItems call, each with the bearer token", async () => {
  const { fetch, calls } = fakeFetch();
  const result = await saveAsYoutubePlaylist("My Book", [piece(1), piece(2)], { signIn: async () => "tok-123", fetch });
  assert.deepEqual(result, { kind: "saved", matched: 2, total: 2, playlistId: "playlist-1" });

  const searches = calls.filter((c) => c.url.includes("/search"));
  assert.equal(searches.length, 2);
  for (const c of searches) {
    assert.equal(c.init?.headers && (c.init.headers as Record<string, string>).authorization, "Bearer tok-123");
    assert.match(c.url, /^https:\/\/www\.googleapis\.com\/youtube\/v3\/search\?part=snippet&type=video&maxResults=1&q=/);
  }
  const playlistCall = calls.find((c) => c.url.includes("/playlists?"))!;
  assert.equal(playlistCall.init?.method, "POST");
  assert.equal(JSON.parse(playlistCall.init!.body as string).snippet.title, "My Book");
  const itemCalls = calls.filter((c) => c.url.includes("/playlistItems?"));
  assert.equal(itemCalls.length, 2);
  for (const c of itemCalls) {
    assert.equal(c.init?.method, "POST");
    assert.equal(JSON.parse(c.init!.body as string).snippet.playlistId, "playlist-1");
  }
});

test("A24: a piece with no match is skipped, not failed, and the partial result says so (\"N of M\")", async () => {
  let n = 0;
  const fetch: FetchLike = async (url, init) => {
    if (url.includes("/search")) {
      n++;
      // The first piece matches, the second does not.
      return new Response(JSON.stringify({ items: n === 1 ? [{ id: { videoId: "vid-1" } }] : [] }), { status: 200 });
    }
    if (url.includes("/playlists?")) return new Response(JSON.stringify({ id: "pl-1" }), { status: 200 });
    if (url.includes("/playlistItems?")) return new Response("{}", { status: 200 });
    throw new Error(`unexpected URL: ${url}`);
  };
  const result = await saveAsYoutubePlaylist("Book", [piece(1), piece(2)], { signIn: async () => "tok", fetch });
  assert.deepEqual(result, { kind: "saved", matched: 1, total: 2, playlistId: "pl-1" });
});

test("A24: no piece matches at all: the playlist still exists, and the result says 0 of M, not an error", async () => {
  const { fetch } = fakeFetch({ search: null });
  const result = await saveAsYoutubePlaylist("Book", [piece(1), piece(2)], { signIn: async () => "tok", fetch });
  assert.deepEqual(result, { kind: "saved", matched: 0, total: 2, playlistId: "playlist-1" });
});

test("A24: the playlist create call failing (network, auth, quota) comes back as a calm error", async () => {
  const fetch: FetchLike = async (url) => {
    if (url.includes("/search")) return new Response(JSON.stringify({ items: [{ id: { videoId: "vid-1" } }] }), { status: 200 });
    if (url.includes("/playlists?")) return new Response("quota exceeded", { status: 403 });
    throw new Error(`unexpected URL: ${url}`);
  };
  const result = await saveAsYoutubePlaylist("Book", [piece(1)], { signIn: async () => "tok", fetch });
  assert.deepEqual(result, { kind: "error" });
});

test("A24: fetch throwing (offline) comes back as a calm error, never an unhandled rejection", async () => {
  const fetch: FetchLike = async () => {
    throw new Error("network down");
  };
  const result = await saveAsYoutubePlaylist("Book", [piece(1)], { signIn: async () => "tok", fetch });
  assert.deepEqual(result, { kind: "error" });
});
