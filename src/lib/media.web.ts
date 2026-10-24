// Web development media store: picked files (and covers) live in IndexedDB so books survive a reload. Same API
// as media.ts. A folder is picked with the browser's directory input; silence detection decodes the audio in
// the page with Web Audio, at a low sample rate, and keeps only its envelope.
import type { PickedFile } from './import-plan';
import type { ByteSource } from './meta/bytes';
import { isImportable } from './meta/read';
import type { Picture } from './meta/types';
import { envelopeFromPcm, isWav, wavEnvelope, type Envelope } from './silence';

export type PickedAudio = PickedFile & { uri: string; blob?: Blob };

const DB = 'mood-read';
const STORE = 'files';
const urls = new Map<string, string>();
/** The input's accept list: audio, the MP4 family by extension (browsers label them unevenly), and AAX/AAXC to explain. */
const ACCEPT = 'audio/*,video/mp4,.m4b,.m4a,.mp3,.wav,.flac,.ogg,.oga,.opus,.aax,.aaxc';
/** Web Audio decodes a whole file at once; past this size the book keeps one chapter (the listener can split it). */
const MAX_DECODE_BYTES = 150 * 1024 * 1024;
const DECODE_RATE = 8000;

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

function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
  };
}

function picked(file: File): PickedAudio {
  return { name: file.name, size: file.size, uri: '', blob: file, source: blobSource(file) };
}

/** A hidden file input, clicked; resolves with its files, or null if the listener cancelled. */
function chooseFiles(folder: boolean): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    if (folder) input.setAttribute('webkitdirectory', '');
    else {
      input.multiple = true;
      input.accept = ACCEPT;
    }
    const finish = (files: File[] | null) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(input.files?.length ? [...input.files] : null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickFiles(): Promise<PickedAudio[] | null> {
  const files = await chooseFiles(false);
  return files ? files.map(picked) : null;
}

/** A folder's audio files (and any AAX/AAXC, to explain); its other files (covers, notes) are left out. */
export async function pickFolder(): Promise<PickedAudio[] | null> {
  const files = await chooseFiles(true);
  return files ? files.filter((f) => isImportable(f.name)).map(picked) : null;
}

export async function storeFile(bookId: string, index: number, file: PickedAudio): Promise<string> {
  const blob: Blob = file.blob ?? (await (await fetch(file.uri)).blob());
  const ref = `idb:${bookId}/${index}`;
  await tx('readwrite', (s) => s.put(blob, ref));
  return ref;
}

export async function storeCover(bookId: string, picture: Picture): Promise<string> {
  const ref = `idb:${bookId}/cover`;
  const blob = new Blob([picture.data.slice().buffer], { type: picture.mime });
  await tx('readwrite', (s) => s.put(blob, ref));
  return ref;
}

/**
 * Downloads a URL into the book's IndexedDB store (05.8, LibriVox's chapter and cover files), the web build's
 * equivalent of media.ts's native `downloadFileInto`: same signature, same `idb:<bookId>/<name>` ref convention
 * as `storeFile`/`storeCover`, so a downloaded LibriVox book resolves and deletes exactly like an imported one.
 */
export async function downloadFileInto(
  bookId: string,
  name: string,
  url: string,
  onProgress: (bytes: number, totalBytes: number | null) => void,
  signal: AbortSignal,
): Promise<{ ref: string }> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Could not download ${url} (${res.status})`);
  const total = Number(res.headers.get('content-length')) || null;
  let blob: Blob;
  if (res.body) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytes += value.length;
      onProgress(bytes, total);
    }
    blob = new Blob(chunks as BlobPart[]);
  } else {
    blob = await res.blob();
    onProgress(blob.size, blob.size);
  }
  const ref = `idb:${bookId}/${name}`;
  await tx('readwrite', (s) => s.put(blob, ref));
  return { ref };
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

/** The file's envelope: a WAV streamed, anything else decoded by the browser at 8 kHz; null if it cannot be. */
export async function silenceEnvelope(file: PickedAudio): Promise<Envelope | null> {
  if (await isWav(file.source)) return wavEnvelope(file.source);
  if (!file.blob || file.size > MAX_DECODE_BYTES || typeof OfflineAudioContext === 'undefined') return null;
  try {
    const ctx = new OfflineAudioContext(1, 1, DECODE_RATE);
    const audio = await ctx.decodeAudioData(await file.blob.arrayBuffer());
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
    return envelopeFromPcm(channels, audio.sampleRate);
  } catch {
    return null;
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
