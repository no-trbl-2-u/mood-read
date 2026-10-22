// Book audio on the device: picked files are copied into the app's documents folder, so the
// book still plays after the picker's cache is cleared. Web uses media.web.ts (IndexedDB).
import { createAudioPlayer } from 'expo-audio';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';

function bookDir(bookId: string): Directory {
  return new Directory(Paths.document, 'books', bookId);
}

/** Stores a picked file for a book; returns the ref to keep in `BookFile.ref`. */
export async function storeFile(bookId: string, index: number, asset: DocumentPickerAsset): Promise<string> {
  const dir = bookDir(bookId);
  dir.create({ idempotent: true, intermediates: true });
  const ext = asset.name.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? '';
  const target = new File(dir, `${String(index).padStart(3, '0')}${ext}`);
  if (target.exists) target.delete();
  await new File(asset.uri).copy(target);
  return target.uri;
}

/** A playable URI for a stored ref. */
export async function resolveFile(ref: string): Promise<string> {
  return ref;
}

export async function deleteBookFiles(bookId: string): Promise<void> {
  const dir = bookDir(bookId);
  if (dir.exists) dir.delete();
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
