// A LibriVox book for the e2e (05.8, shared by e2e/browse.spec.ts and e2e/a11y.spec.ts), hermetic: archive.org's
// search, metadata and download endpoints are a route stub, so no e2e run ever reaches a real network (as
// e2e/scored-book.ts does for a scored book's local seed).
import type { Page, Route } from "@playwright/test";

export const IDENTIFIER = "windinthewillows_test_librivox";
// A minimal, valid 1x1 PNG: the stored cover is rendered by src/ui/Cover.tsx once the book is on the shelf, so
// it has to be bytes a browser can actually decode as an image, not arbitrary filler.
export const COVER_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUAAarVyFEAAAAASUVORK5CYII=", "base64");

export function wav(seconds: number, rate = 8000): Buffer {
  const samples = Math.round(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 800), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

export const SEARCH_BODY = {
  response: {
    numFound: 1,
    docs: [
      { identifier: IDENTIFIER, title: "The Wind in the Willows", creator: "Kenneth Grahame", runtime: "0:08", description: "A classic children's novel." },
    ],
  },
};

// The chapter files' own names end in .wav (not .mp3): what makes a file a chapter is its `format` carrying
// "MP3" and a `track`/`title` (src/lib/librivox-api.ts chapterFiles), not its name; the bytes behind the fixture
// URL are real WAV audio either way, so the duration probe that runs once a chapter downloads has something it
// can actually decode.
export const METADATA_BODY = {
  metadata: {
    identifier: IDENTIFIER,
    title: "The Wind in the Willows",
    creator: "Kenneth Grahame",
    description: "Read by Pat Reader. A classic children's novel.",
    runtime: "0:08",
    licenseurl: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  files: [
    { name: "witw_01_test.wav", title: "01 - The River Bank", track: "1", length: "4", format: "64Kbps MP3", size: "900" },
    { name: "witw_02_test.wav", title: "02 - The Open Road", track: "2", length: "4", format: "64Kbps MP3", size: "900" },
    { name: "witw_cover.png", title: null, track: null, length: null, format: "Item Image", size: String(COVER_PNG.length) },
  ],
};

const SEARCHABLE_TEXT = "the wind in the willows kenneth grahame";

/** The query the app asked for, pulled out of archive.org's own `q` syntax ("title:(<query>)"). */
function queryFrom(q: string | null): string {
  return q ? (/title:\(([^)]*)\)/.exec(q)?.[1] ?? "") : "";
}

/** Stubs archive.org's search, one book's metadata, and its chapter/cover downloads; nothing else answers. */
export async function stubArchiveOrg(page: Page): Promise<void> {
  const audio = wav(4);
  await page.route("https://archive.org/**", async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/advancedsearch.php") {
      const matches = SEARCHABLE_TEXT.includes(queryFrom(url.searchParams.get("q")).toLowerCase());
      return route.fulfill({ status: 200, json: matches ? SEARCH_BODY : { response: { numFound: 0, docs: [] } } });
    }
    if (url.pathname === `/metadata/${IDENTIFIER}`) return route.fulfill({ status: 200, json: METADATA_BODY });
    if (url.pathname === `/download/${IDENTIFIER}/witw_01_test.wav` || url.pathname === `/download/${IDENTIFIER}/witw_02_test.wav`) {
      return route.fulfill({ status: 200, contentType: "audio/wav", body: audio });
    }
    if (url.pathname === `/download/${IDENTIFIER}/witw_cover.png`) {
      return route.fulfill({ status: 200, contentType: "image/png", body: COVER_PNG });
    }
    return route.fulfill({ status: 404, body: "not found" });
  });
}
