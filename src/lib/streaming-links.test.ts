import assert from "node:assert/strict";
import { test } from "node:test";

import { streamingLinks } from "./streaming-links.ts";

const SERVICES = ["spotify", "youtube", "youtube-music", "apple-music", "soundcloud"];

test("A24: every one of the five services gets a link, each a plain search URL on the service's own domain", () => {
  const links = streamingLinks({ title: "Theme 1", artist: "Composer 1" });
  assert.deepEqual(links.map((l) => l.service), SERVICES);
  assert.deepEqual(links.map((l) => l.label), ["Spotify", "YouTube", "YouTube Music", "Apple Music", "SoundCloud"]);
  const hosts = ["open.spotify.com", "www.youtube.com", "music.youtube.com", "music.apple.com", "soundcloud.com"];
  links.forEach((l, i) => assert.ok(l.url.startsWith(`https://${hosts[i]}/`), l.url));
  // A search link, never an exact-track lookup: no API path, no id, just a plain query.
  for (const l of links) assert.ok(/[?/]/.test(l.url) && /(search|results)/.test(l.url));
});

test("A24: the query is title and artist, URL-encoded (spaces, &, apostrophes, unicode)", () => {
  const links = streamingLinks({ title: "Bob's Reel & Variations", artist: "Ola Gjeilo" });
  for (const l of links) {
    assert.ok(!l.url.includes(" "), "no literal space");
    assert.ok(l.url.includes("%26") || l.url.includes("&amp"), "the & is encoded");
    const decoded = decodeURIComponent(l.url);
    assert.ok(decoded.includes("Bob's Reel & Variations"), decoded);
    assert.ok(decoded.includes("Ola Gjeilo"), decoded);
  }

  const unicode = streamingLinks({ title: "Peer Gynt", artist: "Björk Guðmundsdóttir" });
  for (const l of unicode) {
    assert.ok(!l.url.includes(" "));
    assert.ok(decodeURIComponent(l.url).includes("Björk Guðmundsdóttir"));
  }
});

test("A24: two different pieces never share a query string", () => {
  const a = streamingLinks({ title: "Theme 1", artist: "Composer 1" });
  const b = streamingLinks({ title: "Theme 2", artist: "Composer 2" });
  for (let i = 0; i < a.length; i++) assert.notEqual(a[i].url, b[i].url);
});
