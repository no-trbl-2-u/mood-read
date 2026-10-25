// Text to the system clipboard (05.21): expo-clipboard on native; the web build uses navigator.clipboard
// (./clipboard.web.ts).
import * as Clipboard from "expo-clipboard";

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
