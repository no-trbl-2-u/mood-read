// Web development media store: picked files live in IndexedDB so books survive a reload.
import type { DocumentPickerAsset } from 'expo-document-picker';

const DB = 'mood-read';
const STORE = 'files';
const urls = new Map<string, string>();

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeFile(bookId: string, index: number, asset: DocumentPickerAsset): Promise<string> {
  const blob: Blob = asset.file ?? (await (await fetch(asset.uri)).blob());
  const ref = `idb:${bookId}/${index}`;
  await tx('readwrite', (s) => s.put(blob, ref));
  return ref;
}

export async function resolveFile(ref: string): Promise<string> {
  if (!ref.startsWith('idb:')) return ref;
  const cached = urls.get(ref);
  if (cached) return cached;
  const blob = await tx<Blob | undefined>('readonly', (s) => s.get(ref));
  if (!blob) throw new Error('This book\'s audio is no longer stored in this browser');
  const url = URL.createObjectURL(blob);
  urls.set(ref, url);
  return url;
}

export async function deleteBookFiles(bookId: string): Promise<void> {
  const range = IDBKeyRange.bound(`idb:${bookId}/`, `idb:${bookId}/￿`);
  await tx('readwrite', (s) => s.delete(range));
  for (const [ref, url] of urls) {
    if (ref.startsWith(`idb:${bookId}/`)) {
      URL.revokeObjectURL(url);
      urls.delete(ref);
    }
  }
}

export function probeDuration(uri: string, timeoutMs = 15000): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const timer = setTimeout(() => reject(new Error('Timed out reading the file')), timeoutMs);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Could not read the file'));
    };
    audio.src = uri;
  });
}
