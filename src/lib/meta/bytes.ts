// Byte-level helpers for the tag parsers: a random-access source over a file, integer reads and the text
// encodings tags use (Latin-1, UTF-8, UTF-16 with or without a BOM), plus base64. No imports and no platform
// API, so the parsers run the same under `node --test`, on the web and on a phone.

/** Random access to a file's bytes. The app backs it with a Blob (web) or a file handle (native). */
export type ByteSource = {
  size: number;
  /** Up to `length` bytes from `offset`; fewer at the end of the file. */
  read(offset: number, length: number): Promise<Uint8Array>;
  close?(): void;
};

export function memorySource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(Math.max(0, offset), Math.max(0, offset + length)),
  };
}

export function u16be(b: Uint8Array, o: number): number {
  return ((b[o] << 8) | b[o + 1]) >>> 0;
}
export function u16le(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8)) >>> 0;
}
export function u24be(b: Uint8Array, o: number): number {
  return ((b[o] << 16) | (b[o + 1] << 8) | b[o + 2]) >>> 0;
}
export function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
export function u32le(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
/** A 64-bit big-endian integer as a number (exact below 2^53, which covers every file and time here). */
export function u64be(b: Uint8Array, o: number): number {
  return u32be(b, o) * 2 ** 32 + u32be(b, o + 4);
}
export function u64le(b: Uint8Array, o: number): number {
  return u32le(b, o + 4) * 2 ** 32 + u32le(b, o);
}
/** ID3v2's 28-bit "syncsafe" integer: seven bits per byte. */
export function syncsafe(b: Uint8Array, o: number): number {
  return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
}

/** Four (or `len`) bytes as Latin-1 text: box types, chunk ids, magic numbers. */
export function ascii(b: Uint8Array, o: number, len = 4): string {
  let s = "";
  for (let i = o; i < o + len && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

export function latin1(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

/** UTF-8, tolerant: a malformed sequence becomes U+FFFD rather than an error. */
export function utf8(b: Uint8Array): string {
  let s = "";
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    let cp = 0xfffd;
    let n = 1;
    if (c < 0x80) cp = c;
    else if (c >= 0xc2 && c < 0xe0 && i + 1 < b.length) {
      cp = ((c & 0x1f) << 6) | (b[i + 1] & 0x3f);
      n = 2;
    } else if (c >= 0xe0 && c < 0xf0 && i + 2 < b.length) {
      cp = ((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f);
      n = 3;
    } else if (c >= 0xf0 && c < 0xf5 && i + 3 < b.length) {
      cp = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f);
      n = 4;
    }
    s += String.fromCodePoint(cp);
    i += n;
  }
  return s;
}

/** UTF-16: a BOM picks the byte order, else `bigEndian`. */
export function utf16(b: Uint8Array, bigEndian = false): string {
  let o = 0;
  let be = bigEndian;
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) {
    be = false;
    o = 2;
  } else if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    be = true;
    o = 2;
  }
  const units: number[] = [];
  for (; o + 1 < b.length; o += 2) units.push(be ? u16be(b, o) : u16le(b, o));
  let s = "";
  for (let i = 0; i < units.length; i += 4096) s += String.fromCharCode(...units.slice(i, i + 4096));
  return s;
}

/** Strips the NULs and whitespace tags pad their text with. */
export function clean(s: string): string {
  return s.replace(/\u0000+$/g, "").replace(/^﻿/, "").trim();
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function fromBase64(s: string): Uint8Array {
  const clean64 = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean64.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let at = 0;
  for (const ch of clean64) {
    acc = (acc << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, at);
}

export function toBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    s += i + 1 < b.length ? B64[(n >> 6) & 63] : "=";
    s += i + 2 < b.length ? B64[n & 63] : "=";
  }
  return s;
}

/** The MIME type of an image from its first bytes; falls back to the tag's own claim. */
export function imageMime(data: Uint8Array, claimed = ""): string {
  if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
  if (data[0] === 0x89 && ascii(data, 1, 3) === "PNG") return "image/png";
  if (ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") return "image/webp";
  if (ascii(data, 0, 3) === "GIF") return "image/gif";
  const c = claimed.toLowerCase();
  if (c === "jpg" || c === "jpeg") return "image/jpeg";
  if (c === "png") return "image/png";
  return c.includes("/") ? c : "image/jpeg";
}
