// Planning an import (spec 01 A5, A7): read every picked file's tags, stop at an AAX/AAXC file (or any other
// DRM-locked one) before anything is copied, put the files in book order, and take the book's title, author,
// narrator and cover from their tags. Pure: the picked files are byte sources, so `node --test` runs it; the
// copying, duration probe and silence detection are the platform's (./library.ts and ./media).
import { guessTitle } from "./labels.ts";
import type { ByteSource } from "./meta/bytes.ts";
import { isImportable, readAudioMeta } from "./meta/read.ts";
import type { AudioMeta, DrmKind, Picture } from "./meta/types.ts";

/** A file the listener picked: its name and its bytes. The platform adds what it needs to copy it. */
export type PickedFile = { name: string; size: number; source: ByteSource };

export type Inspected<F extends PickedFile = PickedFile> = { file: F; meta: AudioMeta };

export type ImportCheck<F extends PickedFile = PickedFile> =
  | { kind: "ok"; files: Inspected<F>[] }
  | { kind: "drm"; fileName: string; drm: DrmKind }
  | { kind: "unsupported"; fileName: string }
  | { kind: "empty" };

export const UNKNOWN_AUTHOR = "Unknown author";

/** Reads each file's metadata. Only the tags, cover and chapter markers are read, never the audio. */
export async function inspectFiles<F extends PickedFile>(files: F[]): Promise<Inspected<F>[]> {
  const out: Inspected<F>[] = [];
  for (const file of files) out.push({ file, meta: await readAudioMeta(file.source, file.name) });
  return out;
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Book order: by disc and track number when every file has a track number, else by file name. */
export function orderFiles<F extends PickedFile>(list: Inspected<F>[]): Inspected<F>[] {
  const numbered = list.length > 1 && list.every((x) => x.meta.track !== undefined);
  return [...list].sort((a, b) => {
    if (numbered) {
      const d = (a.meta.disc ?? 1) - (b.meta.disc ?? 1) || a.meta.track! - b.meta.track!;
      if (d) return d;
    }
    return byName(a.file.name, b.file.name);
  });
}

/**
 * Whether these files can become a book. Any DRM-locked file stops the import with the note (A7), even beside
 * playable files. Files that are not audio are skipped when other files are (a folder's cover.jpg), and named
 * when they are all there is.
 */
export function checkImport<F extends PickedFile>(list: Inspected<F>[]): ImportCheck<F> {
  if (list.length === 0) return { kind: "empty" };
  const locked = list.find((x) => x.meta.drm);
  if (locked) return { kind: "drm", fileName: locked.file.name, drm: locked.meta.drm! };
  const audio = list.filter((x) => x.meta.format !== "unknown" || isImportable(x.file.name));
  if (audio.length === 0) return { kind: "unsupported", fileName: list[0].file.name };
  return { kind: "ok", files: orderFiles(audio) };
}

/** The value most files agree on (first seen wins a tie). */
function common(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | undefined;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}

export type BookTags = { title: string; author: string; narrator: string; cover: Picture | null };

/**
 * The book's tags. One file: its title, else its album. Several: their common album (each file's title is
 * its chapter's). Author: the album artist, else the artist. Narrator: a narrator tag, else the composer (where
 * audiobook tools put it). Cover: the first file's that has one. File names fill any gap.
 */
export function bookTags(ordered: Pick<Inspected, "file" | "meta">[]): BookTags {
  const metas = ordered.map((x) => x.meta);
  const names = ordered.map((x) => x.file.name);
  const title =
    (metas.length === 1 ? (metas[0].title ?? metas[0].album) : common(metas.map((m) => m.album))) ?? guessTitle(names);
  return {
    title,
    author: common(metas.map((m) => m.albumArtist)) ?? common(metas.map((m) => m.artist)) ?? UNKNOWN_AUTHOR,
    narrator: common(metas.map((m) => m.narrator)) ?? common(metas.map((m) => m.composer)) ?? "",
    cover: metas.find((m) => m.cover)?.cover ?? null,
  };
}
