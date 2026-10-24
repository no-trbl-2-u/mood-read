// The app's contact with LibriVox (05.8, A9): archive.org, which hosts every LibriVox recording and is the
// rights-checker's cleared target (archive.org/developers.html, archive.org/developers/bots.html), for search,
// metadata and downloads. librivox.org's own API is called once per downloaded book, for one field: the link to the
// text it was read from, whose Project Gutenberg number lets the proxy score the book from its text (05.9). Its terms
// came back unclear in 05.8; the rights-checker found them clear in 05.9 (LibriVox's 2026-09-16 API post invites
// third-party apps, asking for requests spaced several seconds apart, which one call per download is). Pure: `fetch`
// is injected, so tests run it against fixture JSON, never a live network.
export type LibriVoxSearchResult = {
  identifier: string;
  title: string;
  /** Joined with ", " when archive.org answers with several (a multi-author book). */
  creator: string;
  /** "mm:ss" (or similar) as archive.org stores it, or null when the item has none. */
  runtime: string | null;
  description: string | null;
  /** LibriVox's own catalog number (archive.org's `call_number`), digits; null when absent. Browse reads a pre-scored
   *  book's overall mood by it (05.10). */
  catalogId: string | null;
};

export type LibriVoxFile = {
  name: string;
  title: string | null;
  /** 1-based chapter order, or null for a file that is not a chapter (the cover, a zip, a text file). */
  track: number | null;
  /** "mm:ss", "h:mm:ss", or seconds as a string; null when archive.org has none for this file. */
  length: string | null;
  format: string;
  /** Bytes, as archive.org's own string; null when it has none. */
  size: number | null;
};

export type LibriVoxItem = {
  identifier: string;
  title: string;
  creator: string;
  description: string | null;
  runtime: string | null;
  licenseurl: string | null;
  /** LibriVox's own catalog number, which archive.org keeps as `call_number`; null when absent or not digits. */
  catalogId: string | null;
  files: LibriVoxFile[];
};

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * A descriptive User-Agent, as archive.org/developers/bots.html's site-wide rule asks for every automated
 * request. A browser's `fetch` silently drops (or blocks) a page script's attempt to set this header, so on the
 * web build we simply never try — `typeof window` is the signal: undefined under React Native's JS engine and
 * under `node --test`, defined in a real browser.
 */
function archiveHeaders(): HeadersInit | undefined {
  return typeof window === "undefined" ? { "User-Agent": "MoodRead/1.0" } : undefined;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** archive.org answers a multi-value field (several authors) as an array; a single value as a plain string. */
function joinField(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").join(", ");
  return "";
}

function readSearchDoc(d: unknown): LibriVoxSearchResult {
  const doc = d as Record<string, unknown>;
  if (typeof doc?.identifier !== "string" || typeof doc.title !== "string") {
    throw new Error("a LibriVox search result came back without an identifier or title");
  }
  return {
    identifier: doc.identifier,
    title: doc.title,
    creator: joinField(doc.creator),
    runtime: asString(doc.runtime),
    description: asString(doc.description) ?? (Array.isArray(doc.description) ? joinField(doc.description) : null),
    catalogId: catalogNumber(doc.call_number),
  };
}

/** The fields a search or the popular list asks archive.org for. */
const SEARCH_FIELDS = ["identifier", "title", "creator", "runtime", "description", "call_number"];

/** Checks archive.org's search answer's shape; anything off is an error rather than a half-read result. */
export function readSearchResponse(body: unknown): LibriVoxSearchResult[] {
  const v = body as { response?: { docs?: unknown } };
  if (!v?.response || !Array.isArray(v.response.docs)) throw new Error("unexpected answer from archive.org's search");
  return v.response.docs.map(readSearchDoc);
}

function readFile(f: unknown): LibriVoxFile {
  const file = f as Record<string, unknown>;
  if (typeof file?.name !== "string" || typeof file.format !== "string") {
    throw new Error("a LibriVox file came back without a name or format");
  }
  const rawTrack = file.track;
  const track = typeof rawTrack === "number" ? rawTrack : typeof rawTrack === "string" ? parseInt(rawTrack, 10) : NaN;
  const rawLength = file.length;
  const rawSize = file.size;
  const size = typeof rawSize === "string" ? Number(rawSize) : typeof rawSize === "number" ? rawSize : NaN;
  return {
    name: file.name,
    format: file.format,
    title: asString(file.title),
    track: Number.isFinite(track) ? track : null,
    length: typeof rawLength === "string" ? rawLength : typeof rawLength === "number" ? String(rawLength) : null,
    size: Number.isFinite(size) ? size : null,
  };
}

/** A public catalog number: digits only, no leading zero, at most nine (the proxy refuses anything else). */
export function catalogNumber(v: unknown): string | null {
  const s = typeof v === "number" && Number.isInteger(v) ? String(v) : typeof v === "string" ? v.trim() : "";
  return /^[1-9][0-9]{0,8}$/.test(s) ? s : null;
}

/** Checks archive.org's metadata answer's shape; anything off is an error rather than a half-read result. */
export function readItem(body: unknown): LibriVoxItem {
  const v = body as { metadata?: Record<string, unknown>; files?: unknown };
  const m = v?.metadata;
  if (!m || typeof m.identifier !== "string" || typeof m.title !== "string" || !Array.isArray(v.files)) {
    throw new Error("unexpected answer from archive.org's metadata");
  }
  return {
    identifier: m.identifier,
    title: m.title,
    creator: joinField(m.creator),
    description: asString(m.description),
    runtime: asString(m.runtime),
    licenseurl: asString(m.licenseurl),
    catalogId: catalogNumber(m.call_number),
    files: v.files.map(readFile),
  };
}

/** Searches the LibriVox collection by title, author or genre at once, one request for all three (A9). */
export async function search(fetchImpl: Fetch, query: string): Promise<LibriVoxSearchResult[]> {
  const q = `collection:librivoxaudio AND (title:(${query}) OR creator:(${query}) OR subject:(${query}))`;
  const params = new URLSearchParams({ q, rows: "20", output: "json" });
  for (const field of SEARCH_FIELDS) params.append("fl[]", field);
  const res = await fetchImpl(`https://archive.org/advancedsearch.php?${params.toString()}`, { headers: archiveHeaders() });
  if (!res.ok) throw new Error(`archive.org's search answered ${res.status}`);
  return readSearchResponse(await res.json());
}

/**
 * The LibriVox collection's most-downloaded books, most first, one page of `rows` (05.10: the owner's `pnpm prescore`
 * walks it). One advancedsearch.php call, the same endpoint and fields as a search.
 */
export async function popular(fetchImpl: Fetch, rows: number, page = 1): Promise<LibriVoxSearchResult[]> {
  const params = new URLSearchParams({ q: "collection:librivoxaudio", rows: String(rows), page: String(page), output: "json" });
  params.append("sort[]", "downloads desc");
  for (const field of SEARCH_FIELDS) params.append("fl[]", field);
  const res = await fetchImpl(`https://archive.org/advancedsearch.php?${params.toString()}`, { headers: archiveHeaders() });
  if (!res.ok) throw new Error(`archive.org's search answered ${res.status}`);
  return readSearchResponse(await res.json());
}

/** One LibriVox book's metadata, chapters, cover and license (its archive.org identifier, from a search result). */
export async function getItem(fetchImpl: Fetch, identifier: string): Promise<LibriVoxItem> {
  const res = await fetchImpl(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, { headers: archiveHeaders() });
  if (!res.ok) throw new Error(`archive.org's metadata answered ${res.status}`);
  return readItem(await res.json());
}

/**
 * The chapter files, in track order: the MP3 derivative that carries a `title` and `track` per file (the Ogg
 * entries never do), one archive.org file per Mood Read chapter. When a book's files mix more than one MP3
 * derivative (a 64 Kbps batch and a VBR batch, say), the batch with the most chapter-shaped files wins, so no
 * chapter is counted twice.
 */
export function chapterFiles(files: LibriVoxFile[]): LibriVoxFile[] {
  const candidates = files.filter((f) => f.track != null && !!f.title && /mp3/i.test(f.format));
  if (candidates.length === 0) return [];
  const counts = new Map<string, number>();
  for (const f of candidates) counts.set(f.format, (counts.get(f.format) ?? 0) + 1);
  const bestFormat = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  return candidates.filter((f) => f.format === bestFormat).sort((a, b) => (a.track ?? 0) - (b.track ?? 0));
}

const COVER_FORMATS = ["Item Tile", "Item Image", "JPEG Thumb"];

/** The cover image file: "Item Image" preferred, else the first of the other known cover formats. */
export function coverFile(files: LibriVoxFile[]): LibriVoxFile | null {
  return files.find((f) => f.format === "Item Image") ?? files.find((f) => COVER_FORMATS.includes(f.format)) ?? null;
}

/** The Project Gutenberg ebook number in a link to its text (gutenberg.org/ebooks/1342, /etext/11, /files/84/...). */
export function gutenbergIdFrom(url: unknown): string | null {
  const m = typeof url === "string" ? /^https?:\/\/(?:www\.)?gutenberg\.org\/(?:ebooks|etext|files)\/(\d+)(?:[/.?#]|$)/i.exec(url.trim()) : null;
  return m ? catalogNumber(m[1]) : null;
}

/**
 * A LibriVox book's text's Project Gutenberg number, from LibriVox's catalog (its `url_text_source`), or null when the
 * text is not on Project Gutenberg. One request per book; only the catalog number goes out.
 */
export async function gutenbergIdFor(fetchImpl: Fetch, catalogId: string): Promise<string | null> {
  const id = catalogNumber(catalogId);
  if (!id) return null;
  const res = await fetchImpl(`https://librivox.org/api/feed/audiobooks/?id=${id}&format=json`);
  if (!res.ok) throw new Error(`LibriVox's catalog answered ${res.status}`);
  const body = (await res.json()) as { books?: { id?: unknown; url_text_source?: unknown }[] };
  const book = Array.isArray(body?.books) ? body.books.find((b) => String(b?.id) === id) : undefined;
  return book ? gutenbergIdFrom(book.url_text_source) : null;
}

/** A file's download URL (05.8, the rights-checker's cleared endpoint): each path segment URL-encoded. */
export function downloadUrl(identifier: string, name: string): string {
  return `https://archive.org/download/${identifier}/${name.split("/").map(encodeURIComponent).join("/")}`;
}

/** A length as archive.org gives it ("mm:ss", "h:mm:ss", or plain seconds) in seconds; null if it cannot be read. */
export function parseLength(length: string | null): number | null {
  if (!length) return null;
  if (/^\d+(\.\d+)?$/.test(length)) return Math.round(Number(length));
  const m = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(length);
  if (!m) return null;
  return m[3] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
}

/** The chapter files' total size in bytes, for the book page's length line ("3 h 41 min · 12 chapters · 168
 *  MB"); null when any chapter file's size is unknown rather than an undercount passed off as the real total. */
export function chapterBytes(files: LibriVoxFile[]): number | null {
  if (files.length === 0) return null;
  let total = 0;
  for (const f of files) {
    if (f.size == null) return null;
    total += f.size;
  }
  return total;
}

/** A chapter file's title, with its leading track number stripped ("01 - The White Rabbit" -> "The White Rabbit"). */
export function chapterTitle(fileTitle: string | null, index: number): string {
  const stripped = fileTitle?.replace(/^\s*\d+\s*[-.:]\s*/, "").trim();
  return stripped || fileTitle?.trim() || `Chapter ${index + 1}`;
}

/**
 * A best-effort "Read by ..." line from an item's description (readers rarely come as clean structured data);
 * null when no clear pattern is there, rather than guessing (05.8 scope: never block on this).
 */
export function readersLine(description: string | null): string | null {
  const names = readerNames(description);
  return names ? `Read by ${names}` : null;
}

/** The readers' names alone ("June Ashby and 6 other volunteers"), the part `readersLine` reads; null when unclear.
 *  A downloaded book keeps them as its narrator, so Credits thanks them by name (05.5, A12). */
export function readerNames(description: string | null): string | null {
  const m = description ? /read by ([^.<\n]{3,160})/i.exec(description) : null;
  const names = m ? m[1]!.trim().replace(/\s+/g, " ") : "";
  return names || null;
}
