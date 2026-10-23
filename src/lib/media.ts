// Book audio on the device: picking files or a folder, reading their bytes for the tag parsers, copying them into
// the app's documents folder (so the book still plays after the picker's cache is cleared), the cover, the
// duration probe and the envelope for silence detection. Web uses media.web.ts (IndexedDB). Nothing here leaves
// the device (agents.md rule 6).
import { createAudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths, type FileHandle } from 'expo-file-system';

import type { PickedFile } from './import-plan';
import type { ByteSource } from './meta/bytes';
import { extension, isImportable } from './meta/read';
import type { Picture } from './meta/types';
import { isWav, wavEnvelope, type Envelope } from './silence';

/** A picked file: its name and bytes, and where the platform reads it from. */
export type PickedAudio = PickedFile & { uri: string };

function bookDir(bookId: string): Directory {
  return new Directory(Paths.document, 'books', bookId);
}

function fileSource(file: File): ByteSource {
  let handle: FileHandle | null = null;
  return {
    size: file.size ?? 0,
    async read(offset, length) {
      handle ??= file.open();
      handle.offset = offset;
      return handle.readBytes(Math.max(0, Math.min(length, (file.size ?? 0) - offset)));
    },
    close() {
      handle?.close();
      handle = null;
    },
  };
}

function picked(file: File, name = file.name): PickedAudio {
  return { name, size: file.size ?? 0, uri: file.uri, source: fileSource(file) };
}

/**
 * Opens the system picker for one or more files. Any type is offered (phones label M4B, Opus and AAX
 * inconsistently); the import reads each file's bytes to decide. Null if the listener cancelled.
 */
export async function pickFiles(): Promise<PickedAudio[] | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets.map((a) => picked(new File(a.uri), a.name));
}

/** Opens the system folder picker; the folder's audio files (and any AAX/AAXC, to explain) make one book. */
export async function pickFolder(): Promise<PickedAudio[] | null> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return null;
  }
  const files = dir.list().filter((x): x is File => x instanceof File && isImportable(x.name));
  return files.map((f) => picked(f));
}

/** Copies a picked file into the book's folder; returns the ref to keep in `BookFile.ref`. */
export async function storeFile(bookId: string, index: number, file: PickedAudio): Promise<string> {
  const dir = bookDir(bookId);
  dir.create({ idempotent: true, intermediates: true });
  const ext = extension(file.name);
  const target = new File(dir, `${String(index).padStart(3, '0')}${ext ? `.${ext}` : ''}`);
  if (target.exists) target.delete();
  await new File(file.uri).copy(target);
  return target.uri;
}

/** Saves a book's cover from its tags; returns the ref to keep in `Book.cover`. */
export async function storeCover(bookId: string, picture: Picture): Promise<string> {
  const dir = bookDir(bookId);
  dir.create({ idempotent: true, intermediates: true });
  const ext = picture.mime === 'image/png' ? 'png' : picture.mime === 'image/webp' ? 'webp' : 'jpg';
  const target = new File(dir, `cover.${ext}`);
  if (target.exists) target.delete();
  target.write(picture.data);
  return target.uri;
}

/** A playable (or displayable) URI for a stored ref. */
export async function resolveFile(ref: string): Promise<string> {
  return ref;
}

export async function deleteBookFiles(bookId: string): Promise<void> {
  const dir = bookDir(bookId);
  if (dir.exists) dir.delete();
}

/**
 * The amplitude envelope of a picked file for silence detection, or null when the phone cannot decode it here.
 * The phone has no general decoder in JS, so only PCM WAV is read (streamed); other formats keep one chapter.
 */
export async function silenceEnvelope(file: PickedAudio): Promise<Envelope | null> {
  if (!(await isWav(file.source))) return null;
  return wavEnvelope(file.source);
}

/** Reads a file's duration by loading it in a muted, throwaway player. */
export function probeDuration(uri: string, timeoutMs = 15000): Promise<number> {
  return new Promise((resolve, reject) => {
    const player = createAudioPlayer({ uri });
    player.muted = true;
    const done = (fn: () => void) => {
      clearTimeout(timer);
      sub.remove();
      player.remove();
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('Timed out reading the file'))), timeoutMs);
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.error) done(() => reject(new Error(s.error ?? 'Could not read the file')));
      else if (s.isLoaded && s.duration > 0) done(() => resolve(s.duration));
    });
  });
}
