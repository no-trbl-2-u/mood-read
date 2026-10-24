import assert from "node:assert/strict";
import { test } from "node:test";

import {
  catalogNumber,
  chapterBytes,
  chapterFiles,
  chapterTitle,
  coverFile,
  downloadUrl,
  getItem,
  gutenbergIdFor,
  gutenbergIdFrom,
  parseLength,
  readerNames,
  readersLine,
  readItem,
  readSearchResponse,
  search,
} from "./librivox-api.ts";

// Small, hand-written fixtures shaped like archive.org's real advancedsearch.php and metadata answers.
const SEARCH_BODY = {
  response: {
    numFound: 2,
    docs: [
      { identifier: "alice_in_wonderland_librivox", title: "Alice's Adventures in Wonderland", creator: "Lewis Carroll", runtime: "2:54:12", description: "A fantasy novel." },
      { identifier: "dracula_1215_librivox", title: "Dracula", creator: ["Bram Stoker"], runtime: null, description: null },
    ],
  },
};

const METADATA_BODY = {
  metadata: {
    identifier: "alice_in_wonderland_librivox",
    title: "Alice's Adventures in Wonderland",
    creator: "Lewis Carroll",
    description: "Read by June Ashby and 6 other volunteers. A fantasy novel for children.",
    runtime: "2:54:12",
    licenseurl: "https://creativecommons.org/publicdomain/zero/1.0/",
    call_number: "200",
  },
  files: [
    { name: "aiw_01_carroll_64kb.mp3", title: "01 - Down the Rabbit-Hole", track: "1", length: "572.4", format: "64Kbps MP3", size: "4580000" },
    { name: "aiw_02_carroll_64kb.mp3", title: "02 - The Pool of Tears", track: "2", length: "12:34", format: "64Kbps MP3", size: "6030000" },
    { name: "aiw_01_carroll_vbr.mp3", title: "01 - Down the Rabbit-Hole", track: 1, length: "572.4", format: "VBR MP3", size: "9160000" },
    { name: "aiw_02_carroll_vbr.mp3", title: "02 - The Pool of Tears", track: 2, length: "12:34", format: "VBR MP3", size: "12060000" },
    { name: "aiw_01_carroll.ogg", title: null, track: null, length: "572.4", format: "Ogg Vorbis", size: "4100000" },
    { name: "aliceinwonderland_1012.jpg", title: null, track: null, length: null, format: "JPEG Thumb", size: "4000" },
    { name: "__ia_thumb.jpg", title: null, track: null, length: null, format: "Item Tile", size: "1200" },
    { name: "aliceinwonderland_1012_itemimage.jpg", title: null, track: null, length: null, format: "Item Image", size: "26000" },
    { name: "aiw_librivox_64kb_mp3.zip", title: null, track: null, length: null, format: "ZIP", size: "10590000" },
  ],
};

function fakeFetch(body: unknown, status = 200): (url: string, init?: RequestInit) => Promise<Response> {
  return async () => new Response(JSON.stringify(body), { status });
}

test("search builds one advancedsearch.php call scoped to the LibriVox collection, by title, author and genre at once", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(SEARCH_BODY), { status: 200 });
  };
  const results = await search(fetchImpl, "alice");
  assert.equal(calls.length, 1, "one request for title, author and genre together");
  const url = new URL(calls[0]!.url);
  assert.equal(url.origin + url.pathname, "https://archive.org/advancedsearch.php");
  assert.equal(url.searchParams.get("q"), "collection:librivoxaudio AND (title:(alice) OR creator:(alice) OR subject:(alice))");
  assert.deepEqual(url.searchParams.getAll("fl[]"), ["identifier", "title", "creator", "runtime", "description"]);
  // node --test has no `window`, matching native/server-side fetch: the User-Agent etiquette header is set.
  assert.equal(new Headers(calls[0]!.init?.headers).get("User-Agent"), "MoodRead/1.0");
  assert.deepEqual(results, [
    { identifier: "alice_in_wonderland_librivox", title: "Alice's Adventures in Wonderland", creator: "Lewis Carroll", runtime: "2:54:12", description: "A fantasy novel." },
    { identifier: "dracula_1215_librivox", title: "Dracula", creator: "Bram Stoker", runtime: null, description: null },
  ]);
});

test("a non-ok search answer throws, and a malformed one throws rather than guessing", async () => {
  await assert.rejects(search(fakeFetch({}, 503), "x"), /503/);
  assert.throws(() => readSearchResponse({}), /unexpected answer/);
  assert.throws(() => readSearchResponse({ response: { docs: [{ title: "No id" }] } }), /identifier or title/);
});

test("getItem reads one archive.org metadata call and validates its shape", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(METADATA_BODY), { status: 200 });
  };
  const item = await getItem(fetchImpl, "alice_in_wonderland_librivox");
  assert.deepEqual(calls, ["https://archive.org/metadata/alice_in_wonderland_librivox"]);
  assert.equal(item.title, "Alice's Adventures in Wonderland");
  assert.equal(item.creator, "Lewis Carroll");
  assert.equal(item.licenseurl, "https://creativecommons.org/publicdomain/zero/1.0/");
  assert.equal(item.files.length, METADATA_BODY.files.length);

  await assert.rejects(getItem(fakeFetch({}, 500), "x"), /500/);
  assert.throws(() => readItem({ metadata: { identifier: "x" }, files: [] }), /unexpected answer/);
  assert.throws(() => readItem({ metadata: { identifier: "x", title: "T" }, files: [{ format: "MP3" }] }), /name or format/);
});

test("an item's LibriVox catalog number comes from archive.org's call_number, digits only (05.9)", () => {
  assert.equal(readItem(METADATA_BODY).catalogId, "200");
  assert.equal(readItem({ ...METADATA_BODY, metadata: { ...METADATA_BODY.metadata, call_number: 253 } }).catalogId, "253");
  for (const bad of [undefined, "", "0", "LV-200", "200a", "-1", "1".repeat(10)]) {
    assert.equal(readItem({ ...METADATA_BODY, metadata: { ...METADATA_BODY.metadata, call_number: bad } }).catalogId, null, String(bad));
  }
  assert.equal(catalogNumber(" 4469 "), "4469");
});

test("a Gutenberg number is read from LibriVox's link to the text, in every form it uses, and nothing else", () => {
  assert.equal(gutenbergIdFrom("https://www.gutenberg.org/etext/1342"), "1342");
  assert.equal(gutenbergIdFrom("http://www.gutenberg.org/ebooks/11"), "11");
  assert.equal(gutenbergIdFrom("https://gutenberg.org/files/84/84-h/84-h.htm"), "84");
  for (const bad of [null, "", "https://archive.org/details/x", "https://www.gutenberg.org/ebooks/search/?query=x", "https://gutenberg.org.evil.example/ebooks/5", "https://www.gutenberg.org/ebooks/11x", "https://gutenberg.ca/ebooks/5"]) {
    assert.equal(gutenbergIdFrom(bad), null, String(bad));
  }
});

test("gutenbergIdFor asks LibriVox's catalog for one book by its number and reads its text link", async () => {
  const calls: string[] = [];
  const answer = { books: [{ id: "200", title: "Alice", url_text_source: "https://www.gutenberg.org/etext/11" }] };
  const id = await gutenbergIdFor(async (url) => {
    calls.push(url);
    return new Response(JSON.stringify(answer));
  }, "200");
  assert.equal(id, "11");
  assert.deepEqual(calls, ["https://librivox.org/api/feed/audiobooks/?id=200&format=json"]);
  assert.equal(await gutenbergIdFor(fakeFetch({ books: [{ id: "200", url_text_source: "https://example.org/text" }] }), "200"), null, "a text elsewhere is no Gutenberg number");
  assert.equal(await gutenbergIdFor(fakeFetch({ books: [{ id: "999", url_text_source: "https://www.gutenberg.org/etext/11" }] }), "200"), null, "another book's answer is ignored");
  assert.equal(await gutenbergIdFor(fakeFetch({}), "200"), null);
  assert.equal(await gutenbergIdFor(async () => assert.fail("no request for a bad number"), "x/../y"), null);
  await assert.rejects(gutenbergIdFor(fakeFetch({}, 500), "200"), /500/);
});

test("chapterFiles picks one MP3 derivative in track order, never the Ogg entries or the cover", () => {
  const item = readItem(METADATA_BODY);
  const chapters = chapterFiles(item.files);
  assert.equal(chapters.length, 2, "one file per chapter, not per derivative");
  assert.deepEqual(chapters.map((f) => f.track), [1, 2]);
  assert.ok(chapters.every((f) => f.format === chapters[0]!.format), "a single derivative, never mixed");
  assert.deepEqual(chapters.map((f) => f.title), ["01 - Down the Rabbit-Hole", "02 - The Pool of Tears"]);
});

test("chapterBytes sums the chapter files' sizes; an unknown size means null rather than an undercount", () => {
  const item = readItem(METADATA_BODY);
  const chapters = chapterFiles(item.files);
  assert.equal(chapterBytes(chapters), 4580000 + 6030000);
  assert.equal(chapterBytes([...chapters, { name: "x.mp3", title: "x", track: 3, length: null, format: chapters[0]!.format, size: null }]), null);
  assert.equal(chapterBytes([]), null);
});

test("coverFile prefers Item Image, else the first other known cover format; a book with none gets null", () => {
  const item = readItem(METADATA_BODY);
  assert.equal(coverFile(item.files)?.name, "aliceinwonderland_1012_itemimage.jpg");
  assert.equal(coverFile(item.files.filter((f) => f.format !== "Item Image"))?.name, "aliceinwonderland_1012.jpg");
  assert.equal(coverFile([{ name: "a.mp3", title: "t", track: 1, length: null, format: "VBR MP3", size: null }]), null);
});

test("downloadUrl points at the sanctioned download endpoint, each path segment encoded", () => {
  assert.equal(
    downloadUrl("alice_in_wonderland_librivox", "aiw_01_carroll_64kb.mp3"),
    "https://archive.org/download/alice_in_wonderland_librivox/aiw_01_carroll_64kb.mp3",
  );
  assert.equal(downloadUrl("id", "a b/c.jpg"), "https://archive.org/download/id/a%20b/c.jpg");
});

test("parseLength reads mm:ss, h:mm:ss and plain seconds; an unreadable length is null", () => {
  assert.equal(parseLength("12:34"), 754);
  assert.equal(parseLength("1:02:03"), 3723);
  assert.equal(parseLength("572.4"), 572);
  assert.equal(parseLength(null), null);
  assert.equal(parseLength("not a length"), null);
});

test("chapterTitle strips a leading track number; a file with no title falls back to a plain chapter number", () => {
  assert.equal(chapterTitle("01 - Down the Rabbit-Hole", 0), "Down the Rabbit-Hole");
  assert.equal(chapterTitle("12. The Mock Turtle's Story", 11), "The Mock Turtle's Story");
  assert.equal(chapterTitle(null, 2), "Chapter 3");
  assert.equal(chapterTitle("   ", 2), "Chapter 3");
});

test("readersLine parses a clear \"Read by\" pattern; anything else is omitted rather than guessed", () => {
  assert.equal(readersLine("Read by June Ashby and 6 other volunteers. A fantasy novel."), "Read by June Ashby and 6 other volunteers");
  assert.equal(readersLine("A fantasy novel with no reader credit."), null);
  assert.equal(readersLine(null), null);
});

test("readerNames keeps just the names, the narrator a downloaded LibriVox book carries (05.5)", () => {
  assert.equal(readerNames("Read by  June Ashby and 6 other volunteers. A fantasy novel."), "June Ashby and 6 other volunteers");
  assert.equal(readerNames("A fantasy novel with no reader credit."), null);
  assert.equal(readerNames(null), null);
});
