import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface PuffinDB extends DBSchema {
  syncQueue: {
    key: string;
    value: {
      id: string;
      url: string;
      method: string;
      body: any;
      timestamp: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<PuffinDB>>;

export function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<PuffinDB>('puffin-offline-db', 1, {
      upgrade(db) {
        db.createObjectStore('syncQueue', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function addToSyncQueue(url: string, method: string, body: any) {
  const db = await initDB();
  const id = crypto.randomUUID();
  await db.put('syncQueue', {
    id,
    url,
    method,
    body,
    timestamp: Date.now(),
  });
  console.log('Operación encolada para sincronización offline', { url, method });
  
  // Intentar sincronizar si hay internet
  if (navigator.onLine) {
    syncNow();
  }
}

export async function syncNow() {
  if (!navigator.onLine) return;

  const db = await initDB();
  const tx = db.transaction('syncQueue', 'readwrite');
  const store = tx.objectStore('syncQueue');
  const allItems = await store.getAll();

  if (allItems.length === 0) return;

  console.log(`Intentando sincronizar ${allItems.length} elementos...`);

  // Ordenar por timestamp
  allItems.sort((a, b) => a.timestamp - b.timestamp);

  for (const item of allItems) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('puffin_token') || ''}`
        },
        body: JSON.stringify(item.body),
      });

      if (response.ok) {
        // Eliminar de la cola
        await db.delete('syncQueue', item.id);
        console.log(`Elemento ${item.id} sincronizado exitosamente.`);
      } else {
        console.error(`Fallo al sincronizar elemento ${item.id}:`, response.statusText);
      }
    } catch (error) {
      console.error(`Error de red sincronizando elemento ${item.id}:`, error);
      break; // Detener si no hay red real o el servidor no responde
    }
  }
}

// Escuchar eventos online
if (typeof window !== 'undefined') {
  window.addEventListener('online', syncNow);
}
