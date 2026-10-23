// Key-value storage on the device (SQLite-backed). Web uses kv.web.ts.
import Storage from 'expo-sqlite/kv-store';

export function getItem(key: string): string | null {
  return Storage.getItemSync(key);
}

export function setItem(key: string, value: string): void {
  Storage.setItemSync(key, value);
}

export function removeItem(key: string): void {
  Storage.removeItemSync(key);
}
