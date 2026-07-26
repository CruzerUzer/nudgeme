// Read-through-cache för serverdata, så appen kan visa din senast kända data
// offline. Ligger i IndexedDB (inte i service workern): datat är authed och
// användarspecifikt, och SW-cachen delas mellan konton på samma enhet → risk
// för läckage. Här nycklas allt per userId istället, och nollställs vid utlogg.
//
// Värden lagras via structured clone (IndexedDB), som — till skillnad från JSON
// — bevarar t.ex. Infinity (klass A:s "ingen gräns" i frekvensinställningar).

/** Abstrakt cache-baksida så OfflineStore kan testas utan en riktig IndexedDB. */
export interface CacheBackend {
  get<T>(userId: string, resource: string): Promise<T | undefined>;
  put(userId: string, resource: string, value: unknown): Promise<void>;
  /** Rensa all cache för en användare (vid utloggning/kontobyte). */
  clearUser(userId: string): Promise<void>;
}

const DB_NAME = "nudgeme-offline";
const STORE = "cache";

function cacheKey(userId: string, resource: string) {
  return `${userId}:${resource}`;
}

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

/** IndexedDB-baserad cache. Standard-backend för OfflineStore i webbläsaren. */
export const idbCache: CacheBackend = {
  async get<T>(userId: string, resource: string): Promise<T | undefined> {
    const v = await run<T | undefined>("readonly", (s) =>
      s.get(cacheKey(userId, resource)),
    );
    return v ?? undefined;
  },
  async put(userId: string, resource: string, value: unknown): Promise<void> {
    await run("readwrite", (s) => s.put(value, cacheKey(userId, resource)));
  },
  async clearUser(userId: string): Promise<void> {
    const prefix = `${userId}:`;
    await run("readwrite", (s) => {
      const req = s.openKeyCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(prefix)) s.delete(cursor.key);
        cursor.continue();
      };
      return req;
    });
  },
};
