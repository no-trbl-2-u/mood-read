// The library on this device, for the screens: the store bound to the platform's key-value backend
// (expo-sqlite on native, localStorage on web), its React hooks, importing picked files as a book, and the
// listener's chapter edits. Storage is reached only through src/lib/ (agents.md rule 7).
import { useEffect, useState, useSyncExternalStore } from "react";

import { deriveChapters } from "./chapters";
import { bookTags, checkImport, inspectFiles } from "./import-plan";
import { getItem, removeItem, setItem } from "./kv";
import { createLibraryStore } from "./library-store";
import { createReachedStore } from "./reached";
import {
  deleteBookFiles,
  pickFiles,
  pickFolder,
  probeDuration,
  resolveFile,
  silenceEnvelope,
  storeCover,
  storeFile,
  type PickedAudio,
} from "./media";
import type { DrmKind } from "./meta/types";
import { silenceBreaks } from "./silence";
import { newId, totalDuration } from "./timeline";
import type { Book, BookFile, Bookmark } from "./types";

export const library = createLibraryStore({ getItem, setItem, removeItem });

/** How far into each book the listener has reached (01.4, A21): src/lib/reached.ts. */
export const reached = createReachedStore({ getItem, setItem, removeItem });

/** The furthest chapter start playback has entered in this book, in seconds, or null. */
export function useFurthestReached(bookId: string): number | null {
  const read = () => reached.furthest(bookId);
  return useSyncExternalStore(reached.subscribe, read, read);
}

/** The furthest place reached within the playing chapter (07.2, A2), or null: src/lib/reached.ts furthestIn. */
export function useFurthestIn(bookId: string, chapterStart: number | null): number | null {
  const read = () => (chapterStart === null ? null : reached.furthestIn(bookId, { start: chapterStart }));
  return useSyncExternalStore(reached.subscribe, read, read);
}

export function useBooks(): Book[] {
  return useSyncExternalStore(library.subscribe, library.books, library.books);
}

export function useBook(id: string | undefined): Book | undefined {
  return useBooks().find((b) => b.id === id);
}

/** The shelf's copy of a LibriVox book, by its archive.org identifier (05.8): once downloaded, its Book.id is a
 *  generated id, not the identifier, so a browse page looks it up this way rather than by id. */
export function useLibriVoxBook(identifier: string | undefined): Book | undefined {
  return useBooks().find((b) => !!identifier && b.source.kind === "librivox" && b.source.librivoxId === identifier);
}

export function useBookmarks(bookId: string): Bookmark[] {
  const read = () => library.bookmarks(bookId);
  return useSyncExternalStore(library.subscribe, read, read);
}

/** A displayable URI for a stored file ref (a cover), or null while it resolves or if it is gone. */
export function useFileUri(ref: string | null): string | null {
  const [resolved, setResolved] = useState<{ ref: string; uri: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    if (ref) resolveFile(ref).then((uri) => live && setResolved({ ref, uri }), () => live && setResolved({ ref, uri: null }));
    return () => {
      live = false;
    };
  }, [ref]);
  return ref && resolved?.ref === ref ? resolved.uri : null;
}

export type ImportOutcome =
  | { kind: "book"; book: Book }
  | { kind: "drm"; fileName: string; drm: DrmKind }
  | { kind: "unsupported"; fileName: string }
  | { kind: "empty" }
  | { kind: "cancelled" };

/** What the import is doing, for the screen's progress line. */
export type ImportStep = "reading" | "copying" | "chapters";

export { pickFiles, pickFolder };

/**
 * Imports picked files as one book (spec 01 A5-A7). Tags are read first; an AAX/AAXC file stops everything
 * before a byte is copied. Then the files are copied onto the device (IndexedDB on web) and never leave it,
 * each one's duration is probed, the cover is saved, and chapters come from markers, else files, else
 * silences.
 */
export async function importFiles(picked: PickedAudio[] | null, onStep?: (s: ImportStep) => void): Promise<ImportOutcome> {
  if (!picked) return { kind: "cancelled" };
  try {
    onStep?.("reading");
    const check = checkImport(await inspectFiles(picked));
    if (check.kind !== "ok") return check;

    const id = newId();
    try {
      onStep?.("copying");
      const files: BookFile[] = [];
      for (let i = 0; i < check.files.length; i++) {
        const { file, meta } = check.files[i];
        const ref = await storeFile(id, i, file);
        let duration: number;
        try {
          duration = await probeDuration(await resolveFile(ref));
        } catch (e) {
          // A file the player cannot load is not a book, whatever its tags say.
          if (!meta.duration) throw e;
          duration = meta.duration;
        }
        files.push({ ref, name: file.name, duration });
      }
      const tags = bookTags(check.files);
      const cover = tags.cover ? await storeCover(id, tags.cover).catch(() => null) : null;

      onStep?.("chapters");
      const forChapters = check.files.map((x, i) => ({
        name: x.file.name,
        duration: files[i].duration,
        title: x.meta.title,
        markers: x.meta.chapters,
      }));
      let breaks: number[] = [];
      if (forChapters.length === 1 && forChapters[0].markers.length === 0) {
        const env = await silenceEnvelope(check.files[0].file).catch(() => null);
        if (env) breaks = silenceBreaks(env, files[0].duration);
      }
      const { chapters } = deriveChapters(id, forChapters, breaks);

      const book: Book = {
        id,
        title: tags.title,
        author: tags.author,
        narrator: tags.narrator,
        cover,
        files,
        chapters,
        duration: totalDuration(files),
        addedAt: Date.now(),
        lastPlayedAt: null,
        source: { kind: "import" },
        onDevice: true,
      };
      library.addBook(book);
      return { kind: "book", book };
    } catch (e) {
      await deleteBookFiles(id).catch(() => {});
      throw e;
    }
  } finally {
    for (const f of picked) f.source.close?.();
  }
}
