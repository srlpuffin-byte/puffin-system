import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface PuffinDB extends DBSchema {
  offline_queue: {
    key: number;
    value: {
      id?: number;
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string | null;
      timestamp: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<PuffinDB>> | null = null;

function getDB() {
  if (typeof window === 'undefined') return null; // SSR safety
  
  if (!dbPromise) {
    dbPromise = openDB<PuffinDB>('puffin-system-offline', 1, {
      upgrade(db) {
        db.createObjectStore('offline_queue', { keyPath: 'id', autoIncrement: true });
      },
    });
  }
  return dbPromise;
}

export async function enqueueRequest(url: string, method: string, headers: Record<string, string>, body: string | null) {
  const db = await getDB();
  if (!db) return;
  
  await db.add('offline_queue', {
    url,
    method,
    headers,
    body,
    timestamp: Date.now()
  });
  window.dispatchEvent(new Event('offline-queue-updated'));
}

export async function getQueueCount() {
  const db = await getDB();
  if (!db) return 0;
  
  return await db.count('offline_queue');
}

export async function syncQueue() {
  const db = await getDB();
  if (!db) return 0;
  
  const tx = db.transaction('offline_queue', 'readonly');
  const store = tx.objectStore('offline_queue');
  const items = await store.getAll();

  if (items.length === 0) return 0;

  let successCount = 0;

  for (const item of items) {
    try {
      // Use native fetch to get the Response object back, 
      // since the headers already contain the auth token from when it was enqueued.
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body ? item.body : undefined
      });
      
      if (res.ok) {
        const deleteTx = db.transaction('offline_queue', 'readwrite');
        await deleteTx.objectStore('offline_queue').delete(item.id!);
        successCount++;
        window.dispatchEvent(new Event('offline-queue-updated'));
      } else {
        console.error("Server rejected offline item", res.status);
        if (res.status >= 400 && res.status < 500) {
           const deleteTx = db.transaction('offline_queue', 'readwrite');
           await deleteTx.objectStore('offline_queue').delete(item.id!);
           window.dispatchEvent(new Event('offline-queue-updated'));
        }
      }
    } catch (err) {
      console.error('Failed to sync offline item', item.id, err);
      break;
    }
  }

  return successCount;
}
