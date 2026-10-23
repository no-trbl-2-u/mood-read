// One entry point for every format 01.6 imports: sniff the container from the file's first bytes (the
// extension only breaks a tie), read its tags, cover, chapters and duration, and say whether it is DRM-locked.
// An AAX/AAXC file is recognised by its content (the 'aax '/'aaxc' brand, an 'adrm' box) and by its extension,
// so a renamed one is still caught. Nothing here decrypts anything (agents.md rule 6).
import { ascii, type ByteSource } from "./bytes.ts";
import { parseId3v1, readId3 } from "./id3.ts";
import { readMp4 } from "./mp4.ts";
import { readWav } from "./riff.ts";
import { emptyMeta, type AudioFormat, type AudioMeta, type DrmKind } from "./types.ts";
import { readFlac, readOgg } from "./vorbis.ts";

/** The extensions the import accepts as audio, and the two it recognises as Audible's. */
export const AUDIO_EXTENSIONS = ["m4b", "m4a", "mp4", "aac", "mp3", "wav", "flac", "ogg", "oga", "opus"] as const;
export const AUDIBLE_EXTENSIONS = ["aax", "aaxc"] as const;

export function extension(name: string): string {
  return name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1].toLowerCase() ?? "";
}

/**
 * True for a name an import should consider: audio, or an Audible file to explain. A macOS AppleDouble file
 * ("._01.mp3", the resource fork a Mac leaves on a USB stick or in an archive's __MACOSX folder) is not audio
 * whatever its extension.
 */
export function isImportable(name: string): boolean {
  if (/(^|[\\/])\._/.test(name)) return false;
  const ext = extension(name);
  return (AUDIO_EXTENSIONS as readonly string[]).includes(ext) || (AUDIBLE_EXTENSIONS as readonly string[]).includes(ext);
}

function drmByName(name: string): DrmKind | null {
  const ext = extension(name);
  return ext === "aax" ? "aax" : ext === "aaxc" ? "aaxc" : null;
}

/** The container, from the first bytes; the extension decides only when the bytes say nothing. */
export function sniffFormat(head: Uint8Array, name = ""): AudioFormat {
  // AppleDouble (00 05 16 07) or AppleSingle (00 05 16 00): metadata only, never audio, whatever the name.
  if (head[0] === 0 && head[1] === 5 && head[2] === 0x16 && (head[3] === 7 || head[3] === 0)) return "unknown";
  if (ascii(head, 4) === "ftyp") return "mp4";
  if (ascii(head, 0) === "fLaC") return "flac";
  if (ascii(head, 0) === "OggS") return "ogg";
  if (ascii(head, 0) === "RIFF" && ascii(head, 8) === "WAVE") return "wav";
  if (ascii(head, 0, 3) === "ID3") {
    // An ID3v2 tag usually fronts an MP3, but FLAC files can carry one too.
    return extension(name) === "flac" ? "flac" : "mp3";
  }
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "mp3";
  const ext = extension(name);
  if (ext === "mp3") return "mp3";
  if (["m4a", "m4b", "mp4", "aax", "aaxc"].includes(ext)) return "mp4";
  if (ext === "flac") return "flac";
  if (["ogg", "oga", "opus"].includes(ext)) return "ogg";
  if (ext === "wav") return "wav";
  return "unknown";
}

async function readMp3(source: ByteSource): Promise<AudioMeta> {
  const meta = emptyMeta("mp3");
  const id3 = await readId3(source, 0);
  if (id3) Object.assign(meta, id3.tags);
  if (!meta.title || !meta.artist) {
    const v1 = source.size >= 128 ? parseId3v1(await source.read(source.size - 128, 128)) : null;
    if (v1) {
      meta.title ??= v1.title;
      meta.artist ??= v1.artist;
      meta.album ??= v1.album;
      meta.track ??= v1.track;
    }
  }
  return meta;
}

/** Reads a file's metadata. A file it cannot parse comes back as `unknown` with no tags, never an error. */
export async function readAudioMeta(source: ByteSource, name: string): Promise<AudioMeta> {
  const head = await source.read(0, 16);
  const format = sniffFormat(head, name);
  let meta: AudioMeta;
  try {
    if (format === "mp4") meta = await readMp4(source);
    else if (format === "mp3") meta = await readMp3(source);
    else if (format === "flac") meta = await readFlac(source);
    else if (format === "ogg") meta = await readOgg(source);
    else if (format === "wav") meta = await readWav(source);
    else meta = emptyMeta("unknown");
  } catch {
    meta = emptyMeta(format);
  }
  meta.drm ??= drmByName(name);
  // An .aaxc file states 'aax ' in some writers' brands: the name is the better tell between the two.
  if (meta.drm === "aax" && drmByName(name) === "aaxc") meta.drm = "aaxc";
  return meta;
}
