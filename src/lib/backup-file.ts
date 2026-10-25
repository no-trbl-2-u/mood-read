// The library backup's file on a phone (05.17, A19): written to the app's cache folder and handed to the system share
// sheet (expo-sharing), where the listener saves or sends it themselves; Mood Read sends it nowhere. Import picks a
// file with the system picker and reads its text. Web uses backup-file.web.ts.
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/** Writes the file and opens the share sheet; resolves once the sheet closes. */
export async function saveBackupFile(name: string, text: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json", dialogTitle: "Export library" });
}

/** The picked file's text, or null if the listener cancelled. */
export async function pickBackupFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "*/*"], copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  return new File(result.assets[0].uri).text();
}
