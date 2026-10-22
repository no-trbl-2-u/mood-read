// The library: books, positions, bookmarks and per-book speed, kept on the device.
import { useSyncExternalStore } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { getItem, removeItem, setItem } from './kv';
import { deleteBookFiles, probeDuration, resolveFile, storeFile } from './media';
import { chaptersFromFiles, newId, stripExtension, totalDuration } from './timeline';
import type { Book, BookFile, Bookmark } from './types';

const BOOKS = 'books';
const posKey = (id: string) => `pos:${id}`;
const marksKey = (id: string) => `bookmarks:${id}`;
const speedKey = (id: string) => `speed:${id}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

// --- reactive store ---------------------------------------------------------------------------

type State = { books: Book[]; bookmarks: Record<string, Bookmark[]> };
let state: State | null = null;
const listeners = new Set<() => void>();

function current(): State {
  if (!state) state = { books: read<Book[]>(BOOKS, []), bookmarks: {} };
  return state;
}

function update(next: Partial<State>) {
  state = { ...current(), ...next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useBooks(): Book[] {
  return useSyncExternalStore(subscribe, () => current().books, () => current().books);
}

export function useBook(id: string | undefined): Book | undefined {
  const books = useBooks();
  return books.find((b) => b.id === id);
}

export function getBook(id: string): Book | undefined {
  return current().books.find((b) => b.id === id);
}

function saveBooks(books: Book[]) {
  setItem(BOOKS, JSON.stringify(books));
  update({ books });
}

// --- import -----------------------------------------------------------------------------------

const AUDIO_TYPES = ['audio/*', 'video/mp4', 'application/octet-stream'];

/**
 * Opens the system picker for one or more audio files and adds them as one book, one chapter
 * per file, in file-name order. Returns the new book, or null if the listener cancelled.
 * Tag reading, covers, folders and chapter markers arrive with 01.6.
 */
export async function importBookFromPicker(): Promise<Book | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: AUDIO_TYPES, multiple: true });
  if (result.canceled || !result.assets?.length) return null;
  const assets = [...result.assets].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
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
      author: 'Unknown author',
      narrator: '',
      cover: null,
      source: 'local',
      files,
      chapters: chaptersFromFiles(files),
      duration: totalDuration(files),
      addedAt: Date.now(),
    };
    saveBooks([book, ...current().books]);
    return book;
  } catch (e) {
    await deleteBookFiles(id).catch(() => {});
    throw e;
  }
}

/** The common prefix of the file names (e.g. "Dune - 01.mp3", "Dune - 02.mp3" -> "Dune"), else the first name. */
export function guessTitle(names: string[]): string {
  const bases = names.map(stripExtension);
  if (bases.length === 1) return bases[0];
  let prefix = bases[0];
  for (const b of bases) while (!b.startsWith(prefix)) prefix = prefix.slice(0, -1);
  const cleaned = prefix.replace(/[\s\-_.(\[]*(part|chapter|ch|disc|cd)?[\s\-_.]*\d*$/i, '').trim();
  return cleaned.length >= 2 ? cleaned : bases[0];
}

export async function removeBook(id: string): Promise<void> {
  await deleteBookFiles(id).catch(() => {});
  removeItem(posKey(id));
  removeItem(marksKey(id));
  removeItem(speedKey(id));
  const { [id]: _, ...bookmarks } = current().bookmarks;
  saveBooks(current().books.filter((b) => b.id !== id));
  update({ bookmarks });
}

// --- position and speed ------------------------------------------------------------------------

export function getPosition(id: string): number {
  return read<number>(posKey(id), 0);
}

export function savePosition(id: string, seconds: number): void {
  setItem(posKey(id), JSON.stringify(Math.max(0, seconds)));
}

export function getSpeed(id: string): number {
  return read<number>(speedKey(id), 1);
}

export function saveSpeed(id: string, speed: number): void {
  setItem(speedKey(id), JSON.stringify(speed));
}

// --- bookmarks ---------------------------------------------------------------------------------

function bookmarksOf(id: string): Bookmark[] {
  const cached = current().bookmarks[id];
  if (cached) return cached;
  const loaded = read<Bookmark[]>(marksKey(id), []);
  state = { ...current(), bookmarks: { ...current().bookmarks, [id]: loaded } };
  return loaded;
}

function saveBookmarks(id: string, list: Bookmark[]) {
  const sorted = [...list].sort((a, b) => a.position - b.position);
  setItem(marksKey(id), JSON.stringify(sorted));
  update({ bookmarks: { ...current().bookmarks, [id]: sorted } });
}

export function useBookmarks(id: string): Bookmark[] {
  return useSyncExternalStore(subscribe, () => bookmarksOf(id), () => bookmarksOf(id));
}

export function addBookmark(bookId: string, position: number, name: string): Bookmark {
  const mark: Bookmark = { id: newId(), bookId, position, name, createdAt: Date.now() };
  saveBookmarks(bookId, [...bookmarksOf(bookId), mark]);
  return mark;
}

export function renameBookmark(bookId: string, markId: string, name: string): void {
  saveBookmarks(bookId, bookmarksOf(bookId).map((m) => (m.id === markId ? { ...m, name } : m)));
}

export function deleteBookmark(bookId: string, markId: string): void {
  saveBookmarks(bookId, bookmarksOf(bookId).filter((m) => m.id !== markId));
}

// --- last book --------------------------------------------------------------------------------

export function getLastBookId(): string | null {
  return read<string | null>('lastBook', null);
}

export function setLastBookId(id: string): void {
  setItem('lastBook', JSON.stringify(id));
}
