// The proxy's storage seam (01.2): one small async key-value interface over which the job, its cached result and
// the spend meter are written. In production it is a Durable Object's own storage (index.ts: each book's job lives
// in its own object, the meter in one more); in tests it is memoryStore(). Values are plain JSON-shaped data.

export type Store = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
};

/** An in-memory Store. Values are deep-copied in and out, as a real store's serialization would. */
export function memoryStore(): Store & { keys(): string[] } {
  const map = new Map<string, string>();
  return {
    async get<T>(key: string) {
      const raw = map.get(key);
      return raw === undefined ? undefined : (JSON.parse(raw) as T);
    },
    async put<T>(key: string, value: T) {
      map.set(key, JSON.stringify(value));
    },
    async delete(key: string) {
      return map.delete(key);
    },
    keys: () => [...map.keys()],
  };
}
