// ID3v2.2, 2.3 and 2.4 (MP3, and the "id3 " chunk some WAVs carry): text tags, the APIC/PIC cover, and CHAP/CTOC
// chapter markers; ID3v1 at the end of an MP3 as a fallback. Format: https://id3.org/id3v2.4.0-structure and
// https://id3.org/id3v2-chapters-1.0.
import {
  ascii,
  clean,
  imageMime,
  latin1,
  syncsafe,
  u24be,
  u32be,
  utf16,
  utf8,
  type ByteSource,
} from "./bytes.ts";
import { leadingNumber, tidyChapters, type AudioMeta, type Picture, type TagChapter } from "./types.ts";

export type Id3Tags = Omit<AudioMeta, "format" | "drm" | "duration">;

/** The largest tag read (covers can be large; nothing sane is bigger). */
const MAX_TAG = 64 * 1024 * 1024;

/** The total size of an ID3v2 tag at the start of `head` (header included), or 0 if there is none. */
export function id3Size(head: Uint8Array): number {
  if (head.length < 10 || ascii(head, 0, 3) !== "ID3" || head[3] > 4) return 0;
  const footer = head[5] & 0x10 ? 10 : 0;
  return 10 + syncsafe(head, 6) + footer;
}

/** Reads the ID3v2 tag at `offset` of a source, if one is there. */
export async function readId3(source: ByteSource, offset = 0): Promise<{ tags: Id3Tags; size: number } | null> {
  const head = await source.read(offset, 10);
  const size = id3Size(head);
  if (!size || size > MAX_TAG) return null;
  return { tags: parseId3v2(await source.read(offset, size)), size };
}

/** Undoes ID3's unsynchronisation: every 0xFF 0x00 becomes 0xFF. */
function deunsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, n);
}

/** Text in one of ID3's four encodings. */
function decodeText(enc: number, b: Uint8Array): string {
  if (enc === 1) return utf16(b, false);
  if (enc === 2) return utf16(b, true);
  if (enc === 3) return utf8(b);
  return latin1(b);
}

/** Where a NUL-terminated string in encoding `enc` ends from `o` (the terminator's index) . */
function terminator(enc: number, b: Uint8Array, o: number): number {
  if (enc === 1 || enc === 2) {
    for (let i = o; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
    return b.length;
  }
  const i = b.indexOf(0, o);
  return i < 0 ? b.length : i;
}

function termLength(enc: number): number {
  return enc === 1 || enc === 2 ? 2 : 1;
}

/** A text frame's value; several NUL-separated values (ID3v2.4) are joined with ", ". */
function textFrame(data: Uint8Array): string {
  if (data.length < 1) return "";
  const enc = data[0];
  const parts: string[] = [];
  let o = 1;
  while (o < data.length) {
    const end = terminator(enc, data, o);
    parts.push(clean(decodeText(enc, data.subarray(o, end))));
    o = end + termLength(enc);
  }
  return parts.filter(Boolean).join(", ");
}

/** TXXX: a described text frame, as [description, value]. */
function userText(data: Uint8Array): [string, string] {
  const enc = data[0];
  const end = terminator(enc, data, 1);
  const desc = clean(decodeText(enc, data.subarray(1, end)));
  const value = clean(decodeText(enc, data.subarray(end + termLength(enc))));
  return [desc, value];
}

function apic(data: Uint8Array, v22: boolean): { type: number; picture: Picture } | null {
  const enc = data[0];
  let o = 1;
  let claimed: string;
  if (v22) {
    claimed = ascii(data, 1, 3);
    o = 4;
  } else {
    const end = data.indexOf(0, 1);
    if (end < 0) return null;
    claimed = latin1(data.subarray(1, end));
    o = end + 1;
  }
  const type = data[o];
  const descEnd = terminator(enc, data, o + 1);
  const img = data.subarray(descEnd + termLength(enc));
  if (img.length === 0) return null;
  return { type, picture: { mime: imageMime(img, claimed), data: img } };
}

type Frame = { id: string; data: Uint8Array };

/** The frames of a tag body (or of a CHAP/CTOC's embedded frames). */
function frames(body: Uint8Array, version: number): Frame[] {
  const out: Frame[] = [];
  const v22 = version === 2;
  const headLen = v22 ? 6 : 10;
  let o = 0;
  while (o + headLen <= body.length) {
    if (body[o] === 0) break; // padding
    const id = ascii(body, o, v22 ? 3 : 4);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    let size = v22 ? u24be(body, o + 3) : version === 4 ? syncsafe(body, o + 4) : u32be(body, o + 4);
    // Some v2.4 writers store plain sizes; trust the plain size when the syncsafe one lands mid-frame.
    if (version === 4 && size !== u32be(body, o + 4) && !looksLikeFrame(body, o + headLen + size)) {
      const plain = u32be(body, o + 4);
      if (looksLikeFrame(body, o + headLen + plain)) size = plain;
    }
    const flags = v22 ? 0 : (body[o + 8] << 8) | body[o + 9];
    let data = body.subarray(o + headLen, Math.min(body.length, o + headLen + size));
    if (version === 4) {
      if (flags & 0x0001) data = data.subarray(4); // data length indicator
      if (flags & 0x0002) data = deunsync(data);
    } else if (version === 3 && flags & 0x0080) {
      data = data.subarray(4); // compressed: decompressed size first; the data stays unread
    }
    const compressedOrEncrypted = version === 4 ? flags & 0x000c : version === 3 ? flags & 0x00c0 : 0;
    if (!compressedOrEncrypted) out.push({ id, data });
    o += headLen + size;
  }
  return out;
}

function looksLikeFrame(b: Uint8Array, o: number): boolean {
  if (o === b.length) return true;
  if (o > b.length) return false;
  return b[o] === 0 || /^[A-Z0-9]{4}$/.test(ascii(b, o, 4));
}

const V22: Record<string, string> = {
  TT2: "TIT2",
  TAL: "TALB",
  TP1: "TPE1",
  TP2: "TPE2",
  TCM: "TCOM",
  TRK: "TRCK",
  TPA: "TPOS",
  TXX: "TXXX",
  PIC: "APIC",
};

/** Parses a whole ID3v2 tag (its 10-byte header first). */
export function parseId3v2(tag: Uint8Array): Id3Tags {
  const out: Id3Tags = { chapters: [] };
  if (id3Size(tag) === 0) return out;
  const version = tag[3];
  const flags = tag[5];
  let body = tag.subarray(10, 10 + syncsafe(tag, 6));
  if (version < 4 && flags & 0x80) body = deunsync(body);
  if (flags & 0x40) {
    // Extended header: v2.3 states its size without the 4 size bytes; v2.4 as syncsafe, including them.
    const ext = version === 4 ? syncsafe(body, 0) : u32be(body, 0) + 4;
    body = body.subarray(ext);
  }
  let coverType = -1;
  const chaps = new Map<string, TagChapter>();
  let order: string[] | null = null;

  for (const f of frames(body, version)) {
    const id = version === 2 ? (V22[f.id] ?? f.id) : f.id;
    switch (id) {
      case "TIT2":
        out.title ||= textFrame(f.data) || undefined;
        break;
      case "TALB":
        out.album ||= textFrame(f.data) || undefined;
        break;
      case "TPE1":
        out.artist ||= textFrame(f.data) || undefined;
        break;
      case "TPE2":
        out.albumArtist ||= textFrame(f.data) || undefined;
        break;
      case "TCOM":
        out.composer ||= textFrame(f.data) || undefined;
        break;
      case "TRCK":
        out.track ??= leadingNumber(textFrame(f.data));
        break;
      case "TPOS":
        out.disc ??= leadingNumber(textFrame(f.data));
        break;
      case "TXXX": {
        const [desc, value] = userText(f.data);
        if (/^narr(ator|ated by)$/i.test(desc) && value) out.narrator ||= value;
        break;
      }
      case "APIC": {
        const p = apic(f.data, version === 2);
        // The front cover (type 3) wins; otherwise the first picture.
        if (p && (coverType === -1 || (p.type === 3 && coverType !== 3))) {
          out.cover = p.picture;
          coverType = p.type;
        }
        break;
      }
      case "CHAP": {
        const end = f.data.indexOf(0);
        if (end < 0 || end + 17 > f.data.length) break;
        const elementId = latin1(f.data.subarray(0, end));
        const startMs = u32be(f.data, end + 1);
        const endMs = u32be(f.data, end + 5);
        const sub = frames(f.data.subarray(end + 17), version === 2 ? 3 : version);
        const t = sub.find((s) => s.id === "TIT2");
        chaps.set(elementId, {
          title: t ? textFrame(t.data) : "",
          start: startMs / 1000,
          end: endMs > startMs && endMs !== 0xffffffff ? endMs / 1000 : undefined,
        });
        break;
      }
      case "CTOC": {
        const end = f.data.indexOf(0);
        if (end < 0) break;
        const tocFlags = f.data[end + 1];
        const count = f.data[end + 2];
        const children: string[] = [];
        let o = end + 3;
        for (let i = 0; i < count && o < f.data.length; i++) {
          const z = f.data.indexOf(0, o);
          const stop = z < 0 ? f.data.length : z;
          children.push(latin1(f.data.subarray(o, stop)));
          o = stop + 1;
        }
        // The top-level table of contents gives the order; a lone CTOC without the flag still counts.
        if (tocFlags & 0x02 || order === null) order = children;
        break;
      }
    }
  }

  if (chaps.size) {
    const ordered = order?.map((id) => chaps.get(id)).filter((c): c is TagChapter => !!c);
    out.chapters = ordered && ordered.length ? ordered : tidyChapters([...chaps.values()]);
  }
  return out;
}

/** ID3v1: the last 128 bytes of an MP3 ("TAG", then 30-byte title, artist and album; v1.1 a track byte). */
export function parseId3v1(tail: Uint8Array): Id3Tags | null {
  if (tail.length < 128) return null;
  const t = tail.subarray(tail.length - 128);
  if (ascii(t, 0, 3) !== "TAG") return null;
  const field = (o: number, n: number) => clean(latin1(t.subarray(o, o + n)).replace(/\u0000.*$/s, "")) || undefined;
  return {
    title: field(3, 30),
    artist: field(33, 30),
    album: field(63, 30),
    track: t[125] === 0 && t[126] !== 0 ? t[126] : undefined,
    chapters: [],
  };
}
