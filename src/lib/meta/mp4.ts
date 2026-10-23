// MP4 / M4A / M4B (and Audible's AAX/AAXC, which are MP4 too): iTunes-style ilst tags and the covr cover,
// chapters from a QuickTime chapter track (tref 'chap', what iTunes and most M4B tools write) or else Nero's
// chpl box, the duration from mvhd, and the DRM signs: an 'aax '/'aaxc' brand, an 'adrm' box or an 'aavd'
// sample entry (Audible), or a 'drms'/'sinf' FairPlay entry. The mdat (the audio) is never read whole: the
// top level is walked by box headers and only moov, plus the chapter track's few text samples, are loaded.
import { ascii, clean, imageMime, latin1, u16be, u32be, u64be, utf16, utf8, type ByteSource } from "./bytes.ts";
import { emptyMeta, tidyChapters, type AudioMeta, type DrmKind, type TagChapter } from "./types.ts";

type Box = { type: string; start: number; headLen: number; size: number };

const MAX_MOOV = 64 * 1024 * 1024;
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "udta", "edts", "dinf", "tref", "sinf", "schi"]);

/** The boxes in `b` from `from` to `to`. */
export function boxes(b: Uint8Array, from = 0, to = b.length): Box[] {
  const out: Box[] = [];
  let o = from;
  while (o + 8 <= to) {
    let size = u32be(b, o);
    const type = latin1(b.subarray(o + 4, o + 8));
    let headLen = 8;
    if (size === 1) {
      if (o + 16 > to) break;
      size = u64be(b, o + 8);
      headLen = 16;
    } else if (size === 0) size = to - o;
    if (size < headLen || o + size > to) break;
    out.push({ type, start: o, headLen, size });
    o += size;
  }
  return out;
}

function child(b: Uint8Array, parent: Box, type: string, skip = 0): Box | undefined {
  return boxes(b, parent.start + parent.headLen + skip, parent.start + parent.size).find((x) => x.type === type);
}

function children(b: Uint8Array, parent: Box, skip = 0): Box[] {
  return boxes(b, parent.start + parent.headLen + skip, parent.start + parent.size);
}

function body(b: Uint8Array, box: Box, skip = 0): Uint8Array {
  return b.subarray(box.start + box.headLen + skip, box.start + box.size);
}

/** 'meta' is a full box in MP4 (4 bytes of version and flags first) but a plain box in QuickTime files. */
function metaSkip(b: Uint8Array, meta: Box): number {
  return ascii(b, meta.start + meta.headLen + 4) === "hdlr" ? 0 : 4;
}

/** Every box of `type` anywhere under `parent`, through the containers MP4 nests boxes in. */
function findDeep(b: Uint8Array, list: Box[], type: string, out: Box[] = []): Box[] {
  for (const x of list) {
    if (x.type === type) out.push(x);
    if (CONTAINERS.has(x.type)) findDeep(b, children(b, x), type, out);
    else if (x.type === "meta") findDeep(b, children(b, x, metaSkip(b, x)), type, out);
    else if (x.type === "stsd") findDeep(b, sampleEntries(b, x), type, out);
  }
  return out;
}

/** stsd's sample entries (each one an 'mp4a', 'aavd', 'drms', 'enca' box), and the boxes inside them. */
function sampleEntries(b: Uint8Array, stsd: Box): Box[] {
  const entries = boxes(b, stsd.start + stsd.headLen + 8, stsd.start + stsd.size);
  const out: Box[] = [];
  for (const e of entries) {
    out.push(e);
    // An audio sample entry is 28 bytes (36 for version 1) before its child boxes.
    const version = u16be(b, e.start + e.headLen + 8);
    const skip = version === 1 ? 44 : version === 2 ? 64 : 28;
    out.push(...boxes(b, e.start + e.headLen + skip, e.start + e.size));
  }
  return out;
}

/** DRM from the ftyp brands and the moov's boxes. */
export function mp4Drm(ftyp: Uint8Array | null, moov: Uint8Array | null): DrmKind | null {
  if (ftyp && ftyp.length >= 8) {
    const brands = [ascii(ftyp, 0)];
    for (let o = 8; o + 4 <= ftyp.length; o += 4) brands.push(ascii(ftyp, o));
    if (brands.includes("aaxc")) return "aaxc";
    if (brands.includes("aax ")) return "aax";
  }
  if (moov) {
    const all = boxes(moov);
    if (findDeep(moov, all, "adrm").length || findDeep(moov, all, "aavd").length) return "aax";
    if (findDeep(moov, all, "drms").length || findDeep(moov, all, "sinf").length) return "protected";
  }
  return null;
}

/** An ilst item's 'data' value: its type code and payload. */
function itemData(b: Uint8Array, item: Box): { type: number; value: Uint8Array } | null {
  const d = child(b, item, "data");
  if (!d) return null;
  const p = body(b, d);
  return { type: u32be(p, 0) & 0xffffff, value: p.subarray(8) };
}

function itemText(b: Uint8Array, item: Box): string | undefined {
  const d = itemData(b, item);
  if (!d) return undefined;
  return clean(d.type === 2 ? utf16(d.value, true) : utf8(d.value)) || undefined;
}

/** Parses ilst tags, chapters (chpl) and the duration from a whole moov box (header included). */
export function parseMoov(moov: Uint8Array): AudioMeta & { chapterTrack?: ChapterTrack } {
  const meta = emptyMeta("mp4");
  const top = boxes(moov);
  const root = top.find((x) => x.type === "moov");
  if (!root) return meta;

  const mvhd = child(moov, root, "mvhd");
  if (mvhd) {
    const p = body(moov, mvhd);
    const v1 = p[0] === 1;
    const scale = u32be(p, v1 ? 20 : 12);
    const dur = v1 ? u64be(p, 24) : u32be(p, 16);
    if (scale > 0 && dur > 0 && dur !== 0xffffffff) meta.duration = dur / scale;
  }

  const ilst = findDeep(moov, [root], "ilst")[0];
  if (ilst) {
    for (const item of children(moov, ilst)) {
      switch (item.type) {
        case "©nam":
          meta.title ??= itemText(moov, item);
          break;
        case "©alb":
          meta.album ??= itemText(moov, item);
          break;
        case "©ART":
          meta.artist ??= itemText(moov, item);
          break;
        case "aART":
          meta.albumArtist ??= itemText(moov, item);
          break;
        case "©wrt":
          meta.composer ??= itemText(moov, item);
          break;
        case "©nrt":
          meta.narrator ??= itemText(moov, item);
          break;
        case "trkn":
        case "disk": {
          const d = itemData(moov, item);
          const n = d && d.value.length >= 4 ? u16be(d.value, 2) : 0;
          if (n > 0) meta[item.type === "trkn" ? "track" : "disc"] ??= n;
          break;
        }
        case "covr": {
          const d = itemData(moov, item);
          if (d && d.value.length && !meta.cover) {
            meta.cover = { mime: imageMime(d.value, d.type === 14 ? "png" : "jpeg"), data: d.value };
          }
          break;
        }
        case "----": {
          // Freeform: mean, name, data. A NARRATOR name is the narrator.
          const name = child(moov, item, "name");
          const label = name ? clean(utf8(body(moov, name, 4))) : "";
          if (/^narrator$/i.test(label)) meta.narrator ??= itemText(moov, item);
          break;
        }
      }
    }
  }

  const chpl = findDeep(moov, [root], "chpl")[0];
  if (chpl) meta.chapters = parseChpl(body(moov, chpl));

  const track = chapterTrack(moov, root);
  return track ? { ...meta, chapterTrack: track } : meta;
}

/** Nero chapters: version, flags, (4 reserved bytes if version 1), a count, then start (100 ns units) and title. */
export function parseChpl(p: Uint8Array): TagChapter[] {
  let o = 4;
  if (p[0] === 1) o += 4;
  const count = p[o++];
  const out: TagChapter[] = [];
  for (let i = 0; i < count && o + 9 <= p.length; i++) {
    const start = u64be(p, o) / 1e7;
    const len = p[o + 8];
    const title = clean(utf8(p.subarray(o + 9, o + 9 + len)));
    out.push({ title, start });
    o += 9 + len;
  }
  return tidyChapters(out);
}

/** Where a QuickTime chapter track's text samples are, and when each starts (seconds). */
export type ChapterTrack = { samples: { offset: number; size: number; start: number; duration: number }[] };

function trackId(b: Uint8Array, trak: Box): number {
  const tkhd = child(b, trak, "tkhd");
  if (!tkhd) return -1;
  const p = body(b, tkhd);
  return u32be(p, p[0] === 1 ? 20 : 12);
}

function chapterTrack(b: Uint8Array, root: Box): ChapterTrack | null {
  const traks = children(b, root).filter((x) => x.type === "trak");
  const ids = new Set<number>();
  for (const t of traks) {
    const tref = child(b, t, "tref");
    const chap = tref && child(b, tref, "chap");
    if (!chap) continue;
    const p = body(b, chap);
    for (let o = 0; o + 4 <= p.length; o += 4) ids.add(u32be(p, o));
  }
  const trak = traks.find((t) => ids.has(trackId(b, t)));
  if (!trak) return null;
  const mdia = child(b, trak, "mdia");
  const mdhd = mdia && child(b, mdia, "mdhd");
  const minf = mdia && child(b, mdia, "minf");
  const stbl = minf && child(b, minf, "stbl");
  if (!mdhd || !stbl) return null;
  const h = body(b, mdhd);
  const scale = u32be(h, h[0] === 1 ? 20 : 12);
  if (!(scale > 0)) return null;

  const stts = child(b, stbl, "stts");
  const stsz = child(b, stbl, "stsz");
  const stsc = child(b, stbl, "stsc");
  const stco = child(b, stbl, "stco") ?? child(b, stbl, "co64");
  if (!stts || !stsz || !stsc || !stco) return null;

  const durations: number[] = [];
  const tt = body(b, stts);
  for (let i = 0, n = u32be(tt, 4); i < n; i++) {
    const count = u32be(tt, 8 + i * 8);
    const delta = u32be(tt, 12 + i * 8);
    for (let k = 0; k < count && durations.length < 10000; k++) durations.push(delta);
  }
  const sz = body(b, stsz);
  const fixed = u32be(sz, 4);
  const nSamples = u32be(sz, 8);
  const sizes = Array.from({ length: Math.min(nSamples, 10000) }, (_, i) => (fixed ? fixed : u32be(sz, 12 + i * 4)));
  const co = body(b, stco);
  const wide = stco.type === "co64";
  const chunks = Array.from({ length: u32be(co, 4) }, (_, i) => (wide ? u64be(co, 8 + i * 8) : u32be(co, 8 + i * 4)));
  const sc = body(b, stsc);
  const runs = Array.from({ length: u32be(sc, 4) }, (_, i) => ({
    first: u32be(sc, 8 + i * 12),
    perChunk: u32be(sc, 12 + i * 12),
  }));

  const samples: ChapterTrack["samples"] = [];
  let sample = 0;
  let time = 0;
  for (let c = 0; c < chunks.length && sample < sizes.length; c++) {
    const run = [...runs].reverse().find((r) => r.first <= c + 1);
    let offset = chunks[c];
    for (let k = 0; k < (run?.perChunk ?? 1) && sample < sizes.length; k++) {
      const duration = (durations[sample] ?? 0) / scale;
      samples.push({ offset, size: sizes[sample], start: time, duration });
      offset += sizes[sample];
      time += duration;
      sample++;
    }
  }
  return { samples };
}

/** A chapter track's text sample: a 16-bit length, then UTF-8 (or UTF-16 with a BOM) text. */
export function chapterSampleText(p: Uint8Array): string {
  if (p.length < 2) return "";
  const len = Math.min(u16be(p, 0), p.length - 2);
  const t = p.subarray(2, 2 + len);
  return clean(t[0] === 0xfe && t[1] === 0xff ? utf16(t, true) : utf8(t));
}

/** Reads an MP4's tags, cover, chapters, duration and DRM from a source, never loading the audio. */
export async function readMp4(source: ByteSource): Promise<AudioMeta> {
  let o = 0;
  let ftyp: Uint8Array | null = null;
  let moov: Uint8Array | null = null;
  while (o + 8 <= source.size && !(ftyp && moov)) {
    const h = await source.read(o, 16);
    if (h.length < 8) break;
    let size = u32be(h, 0);
    const type = ascii(h, 4);
    let headLen = 8;
    if (size === 1) {
      size = u64be(h, 8);
      headLen = 16;
    } else if (size === 0) size = source.size - o;
    if (size < headLen) break;
    if (type === "ftyp") ftyp = (await source.read(o + 8, Math.min(size - 8, 256))).slice();
    if (type === "moov" && size <= MAX_MOOV) moov = (await source.read(o, size)).slice();
    o += size;
  }
  const drm = mp4Drm(ftyp, moov);
  if (!moov) return { ...emptyMeta("mp4"), drm };
  const { chapterTrack: track, ...meta } = parseMoov(moov);
  meta.drm = drm;
  if (track && track.samples.length && !drm) {
    const titled: TagChapter[] = [];
    for (const s of track.samples) {
      const text = s.size > 0 && s.size < 4096 ? chapterSampleText(await source.read(s.offset, s.size)) : "";
      titled.push({ title: text, start: s.start, end: s.start + s.duration });
    }
    const tidy = tidyChapters(titled);
    if (tidy.length) meta.chapters = tidy;
  }
  return meta;
}
