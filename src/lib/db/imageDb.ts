// Liten IndexedDB-lagring för aktivitetsbilder i lokalt läge. Bilder (data-URL:er)
// kan bli stora, så vi håller dem utanför localStorage (som har ett litet tak).
// Nyckel = aktivitetens id, värde = data-URL-sträng.

const DB_NAME = "nudgeme-images";
const STORE = "images";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export function putImage(id: string, dataUrl: string): Promise<void> {
  return run("readwrite", (s) => s.put(dataUrl, id)).then(() => undefined);
}

export async function getImage(id: string): Promise<string | undefined> {
  const v = await run<string | undefined>("readonly", (s) => s.get(id));
  return v ?? undefined;
}

export function deleteImage(id: string): Promise<void> {
  return run("readwrite", (s) => s.delete(id)).then(() => undefined);
}
