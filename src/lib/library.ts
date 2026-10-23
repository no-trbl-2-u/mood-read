// The library on this device, for the screens: the store bound to the platform's key-value backend
// (expo-sqlite on native, localStorage on web), its React hooks, and opening a local file as a book.
// Storage is reached only through src/lib/ (agents.md rule 7).
import * as DocumentPicker from "expo-document-picker";
import { useSyncExternalStore } from "react";

import { getItem, removeItem, setItem } from "./kv";
import { createLibraryStore } from "./library-store";
import { deleteBookFiles, probeDuration, resolveFile, storeFile } from "./media";
import { guessTitle } from "./labels";
import { chaptersFromFiles, newId, totalDuration } from "./timeline";
import type { Book, BookFile, Bookmark } from "./types";

export const library = createLibraryStore({ getItem, setItem, removeItem });

export function useBooks(): Book[] {
  return useSyncExternalStore(library.subscribe, library.books, library.books);
}

export function useBook(id: string | undefined): Book | undefined {
  return useBooks().find((b) => b.id === id);
}

export function useBookmarks(bookId: string): Bookmark[] {
  const read = () => library.bookmarks(bookId);
  return useSyncExternalStore(library.subscribe, read, read);
}

const AUDIO_TYPES = ["audio/*", "video/mp4", "application/octet-stream"];

/**
 * Opens the system picker for one or more audio files and adds them as one book, one chapter per file, in
 * file-name order. Returns the new book, or null if the listener cancelled. The files are copied onto the
 * device (IndexedDB on web) and never leave it. Tags, covers, folders and chapter markers arrive with 01.6.
 */
export async function importBookFromPicker(): Promise<Book | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: AUDIO_TYPES, multiple: true });
  if (result.canceled || !result.assets?.length) return null;
  const assets = [...result.assets].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  );
  const id = newId();
  try {
    const files: BookFile[] = [];
    for (let i = 0; i < assets.length; i++) {
      const ref = await storeFile(id, i, assets[i]);
      const duration = await probeDuration(await resolveFile(ref));
      files.push({ ref, name: assets[i].name, duration });
    }
    const book: Book = {
      id,
      title: guessTitle(assets.map((a) => a.name)),
      author: "Unknown author",
      narrator: "",
      cover: null,
      files,
      chapters: chaptersFromFiles(id, files),
      duration: totalDuration(files),
      addedAt: Date.now(),
      lastPlayedAt: null,
    };
    library.addBook(book);
    return book;
  } catch (e) {
    await deleteBookFiles(id).catch(() => {});
    throw e;
  }
}
