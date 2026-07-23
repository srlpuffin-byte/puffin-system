import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { openDB } from 'idb';

const DB_NAME = 'puffin-query-cache';
const STORE_NAME = 'query-store';

function getDB() {
  if (typeof window === 'undefined') return null;
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME);
    },
  });
}

const idbStorage = {
  getItem: async (key: string) => {
    const db = await getDB();
    if (!db) return null;
    const value = await db.get(STORE_NAME, key);
    return value ? JSON.stringify(value) : null;
  },
  setItem: async (key: string, value: string) => {
    const db = await getDB();
    if (db) {
      // Usamos JSON.parse para no guardar strings literales que se escapan doblemente
      await db.put(STORE_NAME, JSON.parse(value), key);
    }
  },
  removeItem: async (key: string) => {
    const db = await getDB();
    if (db) {
      await db.delete(STORE_NAME, key);
    }
  },
};

export const queryPersister = createAsyncStoragePersister({
  storage: idbStorage,
  key: 'puffin-offline-cache',
});
