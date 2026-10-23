// Web development storage: localStorage, same API as kv.ts.
export function getItem(key: string): string | null {
  return globalThis.localStorage?.getItem(key) ?? null;
}

export function setItem(key: string, value: string): void {
  globalThis.localStorage?.setItem(key, value);
}

export function removeItem(key: string): void {
  globalThis.localStorage?.removeItem(key);
}
