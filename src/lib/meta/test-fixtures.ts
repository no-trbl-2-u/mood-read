// Tiny audio files built in code for the tag-parser tests and the e2e walk: ID3v2 tags (text, APIC, CHAP/CTOC)
// on silent MP3 frames, MP4 boxes (ilst, covr, chpl, a QuickTime chapter track, Audible's brand and adrm), FLAC
// and Ogg with Vorbis comments, and WAV with LIST/INFO and cue points. Nothing large is committed.

const enc = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0) & 0xff));
const utf8 = (s: string) => new TextEncoder().encode(s);

export function cat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const arrs = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrs) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}

function be32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}
function be16(n: number): number[] {
  return [(n >>> 8) & 255, n & 255];
}
function le32(n: number): number[] {
  return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
}
function le16(n: number): number[] {
  return [n & 255, (n >>> 8) & 255];
}
function be64(n: number): number[] {
  return [...be32(Math.floor(n / 2 ** 32)), ...be32(n >>> 0)];
}
function syncsafe(n: number): number[] {
  return [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
}

/** A fake JPEG: the SOI marker and a few bytes, enough for the MIME sniff. */
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 0xff, 0xd9]);
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);

// ---- ID3v2 ----

export type Id3Frame = Uint8Array;

export function id3Frame(id: string, data: Uint8Array, version: 3 | 4 = 3): Id3Frame {
  return cat(enc(id), version === 4 ? syncsafe(data.length) : be32(data.length), [0, 0], data);
}

/** A text frame in UTF-8 (v2.4) or UTF-16 with a BOM (v2.3). */
export function id3Text(id: string, text: string, version: 3 | 4 = 3): Id3Frame {
  if (version === 4) return id3Frame(id, cat([3], utf8(text)), 4);
  const units: number[] = [0xff, 0xfe];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    units.push(c & 255, c >> 8);
  }
  return id3Frame(id, cat([1], units), 3);
}

export function id3Apic(image: Uint8Array, type = 3, mime = "image/jpeg", version: 3 | 4 = 3): Id3Frame {
  return id3Frame("APIC", cat([0], enc(mime), [0, type], enc("cover"), [0], image), version);
}

export function id3Chap(elementId: string, startMs: number, endMs: number, title: string, version: 3 | 4 = 3) {
  const sub = id3Text("TIT2", title, version);
  return id3Frame(
    "CHAP",
    cat(enc(elementId), [0], be32(startMs), be32(endMs), be32(0xffffffff), be32(0xffffffff), sub),
    version,
  );
}

export function id3Ctoc(children: string[], version: 3 | 4 = 3) {
  return id3Frame(
    "CTOC",
    cat(enc("toc"), [0, 0x03, children.length], ...children.map((c) => cat(enc(c), [0]))),
    version,
  );
}

export function id3Tag(frames: Id3Frame[], version: 3 | 4 = 3, padding = 16): Uint8Array {
  const body = cat(...frames, new Uint8Array(padding));
  return cat(enc("ID3"), [version, 0, 0], syncsafe(body.length), body);
}

/** `count` silent MPEG-1 Layer III frames (128 kb/s, 44.1 kHz, mono): about 26 ms each. */
export function mp3Frames(count: number): Uint8Array {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0xc4]);
  return cat(...Array.from({ length: count }, () => frame));
}

/** An MP3 with an ID3v2.3 tag: title, album, artist, a cover, and `seconds` of silence. */
export function taggedMp3(tags: { title?: string; album?: string; artist?: string; cover?: boolean }, seconds = 3) {
  const frames: Id3Frame[] = [];
  if (tags.title) frames.push(id3Text("TIT2", tags.title));
  if (tags.album) frames.push(id3Text("TALB", tags.album));
  if (tags.artist) frames.push(id3Text("TPE1", tags.artist));
  if (tags.cover) frames.push(id3Apic(JPEG));
  return cat(id3Tag(frames), mp3Frames(Math.ceil(seconds / 0.0261)));
}

// ---- MP4 ----

export function box(type: string, ...content: (Uint8Array | number[])[]): Uint8Array {
  const body = cat(...content);
  return cat(be32(8 + body.length), enc(type), body);
}

export function ftyp(major: string, ...compatible: string[]): Uint8Array {
  return box("ftyp", enc(major), be32(0), ...[major, ...compatible].map(enc));
}

export function mvhd(timescale: number, duration: number): Uint8Array {
  return box("mvhd", [0, 0, 0, 0], be32(0), be32(0), be32(timescale), be32(duration), new Uint8Array(80));
}

/** An ilst item with one 'data' box; type 1 is UTF-8, 13 JPEG, 0 binary. */
export function ilstItem(type: string, value: Uint8Array, dataType = 1): Uint8Array {
  const t = type.startsWith("©") ? cat([0xa9], enc(type.slice(1))) : enc(type);
  const data = box("data", be32(dataType), be32(0), value);
  const body = cat(data);
  return cat(be32(8 + body.length), t, body);
}

export function ilst(items: Record<string, string>, cover?: Uint8Array, track?: number): Uint8Array {
  const parts = Object.entries(items).map(([k, v]) => ilstItem(k, utf8(v)));
  if (cover) parts.push(ilstItem("covr", cover, 13));
  if (track) parts.push(ilstItem("trkn", new Uint8Array([0, 0, ...be16(track), 0, 0, 0, 0]), 0));
  return box("ilst", ...parts);
}

export function udtaMeta(ilstBox: Uint8Array, extra: Uint8Array[] = []): Uint8Array {
  const hdlr = box("hdlr", new Uint8Array(4), be32(0), enc("mdir"), enc("appl"), new Uint8Array(9));
  return box("udta", box("meta", [0, 0, 0, 0], hdlr, ilstBox), ...extra);
}

/** Nero chapters, version 1: (start seconds, title). */
export function chpl(chapters: [number, string][]): Uint8Array {
  const entries = chapters.map(([s, t]) => cat(be64(Math.round(s * 1e7)), [utf8(t).length], utf8(t)));
  return box("chpl", [1, 0, 0, 0], be32(0), [chapters.length], ...entries);
}

function tkhd(id: number): Uint8Array {
  return box("tkhd", [0, 0, 0, 7], be32(0), be32(0), be32(id), new Uint8Array(68));
}

/**
 * An M4B with a QuickTime chapter track: ftyp, an mdat holding the chapter titles as text samples, and a moov
 * whose audio trak points (tref 'chap') at text trak 2.
 */
export function m4bWithChapterTrack(chapters: [number, string][], total: number, tags: Record<string, string> = {}) {
  const ft = ftyp("M4B ", "mp42", "isom");
  const samples = chapters.map(([, t]) => cat(be16(utf8(t).length), utf8(t)));
  const mdatBody = cat(...samples);
  const mdat = box("mdat", mdatBody);
  const base = ft.length + 8;
  const offsets: number[] = [];
  let at = base;
  for (const s of samples) {
    offsets.push(at);
    at += s.length;
  }
  const scale = 1000;
  const durations = chapters.map(([s], i) => Math.round(((chapters[i + 1]?.[0] ?? total) - s) * scale));
  const stbl = box(
    "stbl",
    box("stsd", [0, 0, 0, 0], be32(0)),
    box("stts", [0, 0, 0, 0], be32(durations.length), ...durations.map((d) => cat(be32(1), be32(d)))),
    box("stsc", [0, 0, 0, 0], be32(1), be32(1), be32(1), be32(1)),
    box("stsz", [0, 0, 0, 0], be32(0), be32(samples.length), ...samples.map((s) => be32(s.length))),
    box("stco", [0, 0, 0, 0], be32(offsets.length), ...offsets.map(be32)),
  );
  const mdhd = box("mdhd", [0, 0, 0, 0], be32(0), be32(0), be32(scale), be32(total * scale), be32(0));
  const textTrak = box("trak", tkhd(2), box("mdia", mdhd, box("minf", stbl)));
  const audioTrak = box("trak", tkhd(1), box("tref", box("chap", be32(2))));
  const moov = box("moov", mvhd(scale, total * scale), audioTrak, textTrak, udtaMeta(ilst(tags)));
  return cat(ft, mdat, moov);
}

/** An Audible AAX: the 'aax ' brand, and an 'aavd' sample entry carrying an 'adrm' box. */
export function aaxFile(brand = "aax "): Uint8Array {
  const aavd = box("aavd", new Uint8Array(28), box("adrm", new Uint8Array(56)));
  const stsd = box("stsd", [0, 0, 0, 0], be32(1), aavd);
  const trak = box("trak", tkhd(1), box("mdia", box("minf", box("stbl", stsd))));
  return cat(ftyp(brand, "M4B ", "mp42"), box("moov", mvhd(1000, 5000), trak), box("mdat", new Uint8Array(64)));
}

/** The same Audible signature with a plain M4A brand: caught by the adrm box alone. */
export function aaxRebranded(): Uint8Array {
  const aavd = box("aavd", new Uint8Array(28), box("adrm", new Uint8Array(56)));
  const stsd = box("stsd", [0, 0, 0, 0], be32(1), aavd);
  const trak = box("trak", tkhd(1), box("mdia", box("minf", box("stbl", stsd))));
  return cat(ftyp("M4A ", "mp42"), box("moov", mvhd(1000, 5000), trak), box("mdat", new Uint8Array(64)));
}

// ---- Vorbis comments, FLAC, Ogg ----

export function vorbisComments(comments: string[], vendor = "test"): Uint8Array {
  return cat(
    le32(utf8(vendor).length),
    utf8(vendor),
    le32(comments.length),
    ...comments.map((c) => cat(le32(utf8(c).length), utf8(c))),
  );
}

export function flacPicture(image: Uint8Array, type = 3, mime = "image/png"): Uint8Array {
  return cat(be32(type), be32(mime.length), enc(mime), be32(0), be32(1), be32(1), be32(24), be32(0), be32(image.length), image);
}

/** A FLAC file: STREAMINFO (44.1 kHz, `seconds` long), a comment block, and optionally a PICTURE block. */
export function flacFile(comments: string[], seconds: number, picture?: Uint8Array): Uint8Array {
  const total = seconds * 44100;
  const si = new Uint8Array(34);
  // sample rate (20 bits) = 44100, channels-1 (3 bits) = 1, bps-1 (5 bits) = 15, total samples (36 bits).
  const rate = 44100;
  si[10] = (rate >> 12) & 0xff;
  si[11] = (rate >> 4) & 0xff;
  si[12] = ((rate & 0x0f) << 4) | (1 << 1) | 0;
  si[13] = (15 << 4) | Math.floor(total / 2 ** 32);
  si.set(be32(total >>> 0), 14);
  const block = (type: number, body: Uint8Array, last: boolean) =>
    cat([(last ? 0x80 : 0) | type, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255], body);
  const parts = [block(0, si, false), block(4, vorbisComments(comments), !picture)];
  if (picture) parts.push(block(6, flacPicture(picture), true));
  return cat(enc("fLaC"), ...parts, new Uint8Array(16));
}

/** One Ogg page carrying `packet` bytes (no CRC: the parser does not check it). */
function oggPage(data: Uint8Array, granule: number, seq: number, continued: boolean): Uint8Array {
  const segs: number[] = [];
  let left = data.length;
  while (left >= 255) {
    segs.push(255);
    left -= 255;
  }
  segs.push(left);
  return cat(
    enc("OggS"),
    [0, continued ? 1 : 0],
    le32(granule >>> 0),
    le32(Math.floor(granule / 2 ** 32)),
    le32(7),
    le32(seq),
    le32(0),
    [segs.length],
    segs,
    data,
  );
}

/** An Ogg Opus file: OpusHead, OpusTags with `comments`, and a final page at `seconds`. */
export function opusFile(comments: string[], seconds: number): Uint8Array {
  const head = cat(enc("OpusHead"), [1, 1], le16(312), le32(48000), le16(0), [0]);
  const tags = cat(enc("OpusTags"), vorbisComments(comments));
  return cat(
    oggPage(head, 0, 0, false),
    oggPage(tags, 0, 1, false),
    oggPage(new Uint8Array(10), seconds * 48000 + 312, 2, false),
  );
}

/** An Ogg Vorbis file whose comment packet is split over two pages. */
export function vorbisFile(comments: string[], seconds: number): Uint8Array {
  const id = cat([1], enc("vorbis"), le32(0), [2], le32(44100), new Uint8Array(13));
  const tags = cat([3], enc("vorbis"), vorbisComments(comments), [1]);
  const half = 255 * 2;
  const first = tags.subarray(0, Math.min(half, tags.length));
  const pages = [oggPage(id, 0, 0, false)];
  if (tags.length > half) {
    // A page whose last lacing value is 255 continues the packet on the next page.
    const segs = Array(half / 255).fill(255);
    pages.push(cat(enc("OggS"), [0, 0], le32(0), le32(0), le32(7), le32(1), le32(0), [segs.length], segs, first));
    pages.push(oggPage(tags.subarray(half), 0, 2, true));
  } else pages.push(oggPage(tags, 0, 1, false));
  pages.push(oggPage(new Uint8Array(10), seconds * 44100, 3, false));
  return cat(...pages);
}

// ---- WAV ----

function chunk(id: string, body: Uint8Array): Uint8Array {
  return cat(enc(id), le32(body.length), body, body.length & 1 ? [0] : []);
}

/** A mono 16-bit WAV of `samples`, with optional LIST/INFO tags and cue points named by labl notes. */
export function wavFile(
  samples: Int16Array,
  rate = 8000,
  info: Record<string, string> = {},
  cues: [number, string][] = [],
): Uint8Array {
  const fmt = cat(le16(1), le16(1), le32(rate), le32(rate * 2), le16(2), le16(16));
  const data = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  const parts = [chunk("fmt ", fmt)];
  const infoKeys = Object.entries(info);
  if (infoKeys.length) {
    parts.push(chunk("LIST", cat(enc("INFO"), ...infoKeys.map(([k, v]) => chunk(k, cat(utf8(v), [0]))))));
  }
  if (cues.length) {
    parts.push(
      chunk(
        "cue ",
        cat(
          le32(cues.length),
          ...cues.map(([sec], i) => cat(le32(i + 1), le32(0), enc("data"), le32(0), le32(0), le32(Math.round(sec * rate)))),
        ),
      ),
    );
    parts.push(chunk("LIST", cat(enc("adtl"), ...cues.map(([, t], i) => chunk("labl", cat(le32(i + 1), utf8(t), [0]))))));
  }
  parts.push(chunk("data", data));
  const body = cat(enc("WAVE"), ...parts);
  return cat(enc("RIFF"), le32(body.length), body);
}

/** Audio for silence detection: alternating tone and silence, as [seconds, loud] spans. */
export function toneAndSilence(spans: [number, boolean][], rate = 8000): Int16Array {
  const total = spans.reduce((n, [s]) => n + Math.round(s * rate), 0);
  const out = new Int16Array(total);
  let i = 0;
  for (const [s, loud] of spans) {
    const n = Math.round(s * rate);
    for (let k = 0; k < n; k++, i++) out[i] = loud ? Math.round(Math.sin((2 * Math.PI * 220 * k) / rate) * 8000) : 0;
  }
  return out;
}
