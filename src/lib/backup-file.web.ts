// The library backup's file on the web build (05.17, A19): downloaded as a .json file the listener keeps; imported
// through a file input. Same API as backup-file.ts.

/** Downloads the file. */
export async function saveBackupFile(name: string, text: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked once the browser has taken the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A hidden file input, clicked: the chosen file's text, or null if the listener cancelled. */
export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    const finish = (file: File | null) => {
      input.remove();
      if (!file) resolve(null);
      else file.text().then(resolve, reject);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}
