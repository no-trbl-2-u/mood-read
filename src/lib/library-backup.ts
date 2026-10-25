// "Export library" and "Import library" on this device (05.17, A19), for Settings: the pure backup (./backup.ts) bound
// to the stores the app keeps a book's data in and to the platform's file (./backup-file.ts). Storage is reached only
// through src/lib/ (agents.md rule 7).
import { backupFileName, backupText, exportLibrary, importLibrary, type ImportResult } from "./backup";
import { pickBackupFile, saveBackupFile } from "./backup-file";
import { getItem, removeItem, setItem } from "./kv";
import { library, reached } from "./library";
import { scoringStore } from "./scoring";
import { verdicts } from "./verdicts";

const kv = { getItem, setItem, removeItem };

/** Writes the whole library to one file; resolves with how many books it holds. */
export async function exportLibraryFile(): Promise<number> {
  const now = new Date();
  const books = library.books();
  await saveBackupFile(backupFileName(now), backupText(exportLibrary(kv, books, now)));
  return books.length;
}

/** Picks a library file and restores it onto the shelf's matching books; null if the listener cancelled. */
export async function importLibraryFile(): Promise<ImportResult | null> {
  const text = await pickBackupFile();
  if (text === null) return null;
  return importLibrary(text, library.books(), {
    kv,
    setChapters: (id, chapters) => library.setChapters(id, chapters),
    refresh: (id) => {
      library.refresh(id);
      scoringStore.refresh(id);
      reached.refresh(id);
      verdicts.refresh(id);
    },
  });
}
