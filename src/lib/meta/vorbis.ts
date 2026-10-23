// FLAC and Ogg (Vorbis, Opus): Vorbis comments (TITLE, ALBUM, ARTIST, ...), the cover from a FLAC PICTURE block
// or a METADATA_BLOCK_PICTURE comment, chapters from the CHAPTERnnn / CHAPTERnnnNAME comments, and the duration
// (FLAC STREAMINFO; Ogg's last granule position). Formats: https://xiph.org/flac/format.html,
// https://xiph.org/vorbis/doc/v-comment.html, RFC 7845 (Opus), https://wiki.xiph.org/Chapter_Extension.
import { ascii, concat, fromBase64, imageMime, latin1, u32be, u32le, u64le, u16le, utf8, type ByteSource } from "./bytes.ts";
import { readId3 } from "./id3.ts";
import { emptyMeta, leadingNumber, tidyChapters, type AudioMeta, type Picture, type TagChapter } from "./types.ts";

const MAX_BLOCK = 32 * 1024 * 1024;

/** A FLAC PICTURE block's body (also what METADATA_BLOCK_PICTURE carries, base64): type, MIME, image. */
export function parseFlacPicture(p: Uint8Array): { type: number; picture: Picture } | null {
  if (p.length < 32) return null;
  const type = u32be(p, 0);
  const mimeLen = u32be(p, 4);
  const mime = latin1(p.subarray(8, 8 + mimeLen));
  let o = 8 + mimeLen;
  const descLen = u32be(p, o);
  o += 4 + descLen + 16;
  const len = u32be(p, o);
  const data = p.subarray(o + 4, o + 4 + len);
  if (!data.length) return null;
  return { type, picture: { mime: imageMime(data, mime), data } };
}

/** "01:02:03.500" (or "62:03.5") as seconds. */
function clock(s: string): number | undefined {
  const m = s.trim().match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Applies a list of "KEY=value" comments to the metadata. */
export function applyComments(meta: AudioMeta, comments: string[]): void {
  let coverType = -1;
  const chapters = new Map<string, Partial<TagChapter>>();
  for (const c of comments) {
    const eq = c.indexOf("=");
    if (eq <= 0) continue;
    const key = c.slice(0, eq).toUpperCase();
    const value = c.slice(eq + 1).trim();
    if (!value) continue;
    const chap = key.match(/^CHAPTER(\d+)(NAME)?$/);
    if (chap) {
      const entry = chapters.get(chap[1]) ?? {};
      if (chap[2]) entry.title = value;
      else entry.start = clock(value);
      chapters.set(chap[1], entry);
      continue;
    }
    switch (key) {
      case "TITLE":
        meta.title ??= value;
        break;
      case "ALBUM":
        meta.album ??= value;
        break;
      case "ARTIST":
        meta.artist = meta.artist ? `${meta.artist}, ${value}` : value;
        break;
      case "ALBUMARTIST":
      case "ALBUM ARTIST":
        meta.albumArtist ??= value;
        break;
      case "COMPOSER":
        meta.composer ??= value;
        break;
      case "NARRATOR":
      case "PERFORMER":
        if (key === "NARRATOR" || !meta.narrator) meta.narrator = value;
        break;
      case "TRACKNUMBER":
        meta.track ??= leadingNumber(value);
        break;
      case "DISCNUMBER":
        meta.disc ??= leadingNumber(value);
        break;
      case "METADATA_BLOCK_PICTURE": {
        const p = parseFlacPicture(fromBase64(value));
        if (p && (coverType === -1 || (p.type === 3 && coverType !== 3))) {
          meta.cover = p.picture;
          coverType = p.type;
        }
        break;
      }
      case "COVERART": {
        if (!meta.cover) {
          const data = fromBase64(value);
          if (data.length) meta.cover = { mime: imageMime(data), data };
        }
        break;
      }
    }
  }
  if (chapters.size) {
    const list = [...chapters.values()]
      .filter((c): c is { start: number; title?: string } => typeof c.start === "number")
      .map((c) => ({ title: c.title ?? "", start: c.start }));
    meta.chapters = tidyChapters(list);
  }
}

/** A Vorbis comment block (little-endian lengths): vendor, then each "KEY=value". */
export function parseComments(p: Uint8Array): string[] {
  if (p.length < 8) return [];
  let o = 4 + u32le(p, 0);
  const count = u32le(p, o);
  o += 4;
  const out: string[] = [];
  for (let i = 0; i < count && o + 4 <= p.length; i++) {
    const len = u32le(p, o);
    out.push(utf8(p.subarray(o + 4, o + 4 + len)));
    o += 4 + len;
  }
  return out;
}

/** A FLAC file: optional ID3v2 first, then "fLaC" and its metadata blocks. */
export async function readFlac(source: ByteSource): Promise<AudioMeta> {
  const meta = emptyMeta("flac");
  let o = 0;
  const id3 = await readId3(source, 0);
  if (id3) {
    Object.assign(meta, { ...id3.tags, chapters: id3.tags.chapters });
    o = id3.size;
  }
  if (ascii(await source.read(o, 4), 0) !== "fLaC") return meta;
  o += 4;
  let coverType = -1;
  for (let guard = 0; guard < 128 && o + 4 <= source.size; guard++) {
    const h = await source.read(o, 4);
    const last = (h[0] & 0x80) !== 0;
    const type = h[0] & 0x7f;
    const len = (h[1] << 16) | (h[2] << 8) | h[3];
    if (type === 0 || type === 4 || type === 6) {
      const p = len <= MAX_BLOCK ? await source.read(o + 4, len) : new Uint8Array(0);
      if (type === 0 && p.length >= 18) {
        const rate = (p[10] << 12) | (p[11] << 4) | (p[12] >> 4);
        const total = (p[13] & 0x0f) * 2 ** 32 + u32be(p, 14);
        if (rate > 0 && total > 0) meta.duration = total / rate;
      } else if (type === 4) {
        applyComments(meta, parseComments(p));
      } else if (type === 6) {
        const pic = parseFlacPicture(p);
        if (pic && (coverType === -1 || (pic.type === 3 && coverType !== 3))) {
          meta.cover = pic.picture;
          coverType = pic.type;
        }
      }
    }
    o += 4 + len;
    if (last) break;
  }
  return meta;
}

type OggPage = { granule: number; serial: number; segments: number[]; dataStart: number; end: number };

function oggPage(b: Uint8Array, o: number): OggPage | null {
  if (o + 27 > b.length || ascii(b, o) !== "OggS") return null;
  const n = b[o + 26];
  if (o + 27 + n > b.length) return null;
  const segments = Array.from(b.subarray(o + 27, o + 27 + n));
  const dataStart = o + 27 + n;
  const end = dataStart + segments.reduce((s, x) => s + x, 0);
  return { granule: u64le(b, o + 6), serial: u32le(b, o + 14), segments, dataStart, end };
}

/** The first `count` packets of an Ogg stream's first logical bitstream, from its pages. */
export function oggPackets(b: Uint8Array, count: number): Uint8Array[] {
  const packets: Uint8Array[] = [];
  let parts: Uint8Array[] = [];
  let o = 0;
  let serial: number | null = null;
  while (packets.length < count) {
    const page = oggPage(b, o);
    if (!page || page.end > b.length) break;
    if (serial === null) serial = page.serial;
    if (page.serial === serial) {
      let at = page.dataStart;
      for (const seg of page.segments) {
        parts.push(b.subarray(at, at + seg));
        at += seg;
        if (seg < 255) {
          packets.push(concat(parts));
          parts = [];
          if (packets.length >= count) break;
        }
      }
    }
    o = page.end;
  }
  return packets;
}

/** An Ogg Vorbis or Opus file's comments, cover, chapters and duration. */
export async function readOgg(source: ByteSource): Promise<AudioMeta> {
  const meta = emptyMeta("ogg");
  let want = 64 * 1024;
  let packets: Uint8Array[] = [];
  // The comment packet can span many pages when it carries a cover; read more until it is whole.
  for (;;) {
    const head = await source.read(0, want);
    packets = oggPackets(head, 2);
    if (packets.length >= 2 || head.length >= source.size || want >= MAX_BLOCK) break;
    want *= 4;
  }
  const [id, tags] = packets;
  if (!id) return meta;
  let rate = 0;
  let preSkip = 0;
  if (ascii(id, 0, 8) === "OpusHead") {
    rate = 48000;
    preSkip = u16le(id, 10);
    if (tags && ascii(tags, 0, 8) === "OpusTags") applyComments(meta, parseComments(tags.subarray(8)));
  } else if (id[0] === 1 && ascii(id, 1, 6) === "vorbis") {
    rate = u32le(id, 12);
    if (tags && tags[0] === 3 && ascii(tags, 1, 6) === "vorbis") applyComments(meta, parseComments(tags.subarray(7)));
  }
  // Duration: the granule position of the last page.
  const tailLen = Math.min(source.size, 64 * 1024);
  const tail = await source.read(source.size - tailLen, tailLen);
  for (let o = tail.length - 27; o >= 0; o--) {
    if (tail[o] === 0x4f && ascii(tail, o) === "OggS") {
      const granule = u64le(tail, o + 6);
      if (rate > 0 && granule > 0 && granule < 2 ** 52) meta.duration = Math.max(0, granule - preSkip) / rate;
      break;
    }
  }
  return meta;
}
