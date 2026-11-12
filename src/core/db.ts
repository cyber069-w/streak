/** IndexedDB persistence: one key-value store on this device. */
import { openDB, type IDBPDatabase } from 'idb';

let dbPromise: Promise<IDBPDatabase> | null = null;
const db = () => (dbPromise ??= openDB('streak-app', 1, { upgrade: (d) => void d.createObjectStore('kv') }));

export const storage = {
  async get<T>(key: string): Promise<T | undefined> { return (await (await db()).get('kv', key)) as T | undefined; },
  async set(key: string, value: unknown) { await (await db()).put('kv', value, key); },
  async del(key: string) { await (await db()).delete('kv', key); },
};
