// Text to the system clipboard on the web build (05.21): the browser's own async clipboard.
export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard) throw new Error("no clipboard in this browser");
  await navigator.clipboard.writeText(text);
}
