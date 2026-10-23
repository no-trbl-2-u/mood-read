// WAV (RIFF): LIST/INFO tags (INAM title, IART artist, IPRD album, ITRK track), an "id3 " chunk if a tool wrote
// one, the duration from fmt and data, and chapters from cue points named by LIST/adtl 'labl' notes. The data
// chunk is skipped by its header; the audio is never read.
import { ascii, clean, u16le, u32le, utf8, type ByteSource } from "./bytes.ts";
import { parseId3v2 } from "./id3.ts";
import { emptyMeta, leadingNumber, tidyChapters, type AudioMeta } from "./types.ts";

const MAX_CHUNK = 64 * 1024 * 1024;

export type WavFormat = { format: number; channels: number; rate: number; bits: number; blockAlign: number };

/** The fmt chunk's fields. Format 1 is integer PCM, 3 is float; 0xFFFE is extensible (its sub-format follows). */
export function parseFmt(p: Uint8Array): WavFormat {
  let format = u16le(p, 0);
  if (format === 0xfffe && p.length >= 26) format = u16le(p, 24);
  return { format, channels: u16le(p, 2), rate: u32le(p, 4), blockAlign: u16le(p, 12), bits: u16le(p, 14) };
}

/** Walks a WAV's chunks by their headers: where each is and how long. */
export async function wavChunks(source: ByteSource): Promise<{ id: string; offset: number; size: number }[]> {
  const head = await source.read(0, 12);
  if (ascii(head, 0) !== "RIFF" || ascii(head, 8) !== "WAVE") return [];
  const out: { id: string; offset: number; size: number }[] = [];
  let o = 12;
  while (o + 8 <= source.size && out.length < 512) {
    const h = await source.read(o, 8);
    if (h.length < 8) break;
    const id = ascii(h, 0);
    const size = u32le(h, 4);
    out.push({ id, offset: o + 8, size: Math.min(size, source.size - o - 8) });
    o += 8 + size + (size & 1);
  }
  return out;
}

export async function readWav(source: ByteSource): Promise<AudioMeta> {
  const meta = emptyMeta("wav");
  const chunks = await wavChunks(source);
  let fmt: WavFormat | null = null;
  let dataSize = 0;
  const cues = new Map<number, number>();
  const labels = new Map<number, string>();
  for (const c of chunks) {
    if (c.id === "data") {
      dataSize = c.size;
      continue;
    }
    if (c.size > MAX_CHUNK) continue;
    if (c.id === "fmt ") fmt = parseFmt(await source.read(c.offset, c.size));
    else if (c.id === "id3 " || c.id === "ID3 ") {
      const t = parseId3v2(await source.read(c.offset, c.size));
      for (const k of ["title", "album", "artist", "albumArtist", "composer", "narrator", "track", "cover"] as const) {
        if (t[k] !== undefined && meta[k] === undefined) (meta as Record<string, unknown>)[k] = t[k];
      }
      if (t.chapters.length) meta.chapters = t.chapters;
    } else if (c.id === "cue ") {
      const p = await source.read(c.offset, c.size);
      const n = u32le(p, 0);
      for (let i = 0; i < n && 4 + i * 24 + 24 <= p.length; i++) {
        const at = 4 + i * 24;
        cues.set(u32le(p, at), u32le(p, at + 20));
      }
    } else if (c.id === "LIST") {
      const p = await source.read(c.offset, c.size);
      const kind = ascii(p, 0);
      let o = 4;
      while (o + 8 <= p.length) {
        const id = ascii(p, o);
        const size = u32le(p, o + 4);
        const sub = p.subarray(o + 8, o + 8 + size);
        if (kind === "INFO") {
          const text = clean(utf8(sub)) || undefined;
          if (id === "INAM") meta.title ??= text;
          else if (id === "IART") meta.artist ??= text;
          else if (id === "IPRD") meta.album ??= text;
          else if (id === "ITRK" || id === "IPRT") meta.track ??= leadingNumber(text);
        } else if (kind === "adtl" && id === "labl" && sub.length >= 4) {
          labels.set(u32le(sub, 0), clean(utf8(sub.subarray(4))));
        }
        o += 8 + size + (size & 1);
      }
    }
  }
  if (fmt && fmt.rate > 0) {
    const bytesPerSecond = fmt.blockAlign > 0 ? fmt.blockAlign * fmt.rate : (fmt.channels * fmt.bits * fmt.rate) / 8;
    if (bytesPerSecond > 0 && dataSize > 0) meta.duration = dataSize / bytesPerSecond;
    if (cues.size && !meta.chapters.length) {
      meta.chapters = tidyChapters(
        [...cues.entries()].map(([id, sample]) => ({ title: labels.get(id) ?? "", start: sample / fmt!.rate })),
      );
    }
  }
  return meta;
}
