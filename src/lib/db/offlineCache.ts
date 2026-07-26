// Offline-lagring i IndexedDB för serverdata. Två object stores i samma DB:
//   - "cache":  read-through-cache (fas 1) så appen visar din senast kända data.
//   - "outbox": kö av skrivningar (fas 2) som spelas upp när nätet är tillbaka.
// Allt nycklas per userId och nollställs vid utloggning (multi-user-isolering).
// Ligger medvetet i app-lagret, inte i service workern (authed, användarspecifik
// data i SW-cachen delas mellan konton på samma enhet → läckagerisk).
//
// Värden lagras via structured clone, som — till skillnad från JSON — bevarar
// t.ex. Infinity (klass A:s "ingen gräns" i frekvensinställningar).

const DB_NAME = "nudgeme-offline";
const DB_VERSION = 2;
const CACHE_STORE = "cache";
const OUTBOX_STORE = "outbox";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE);
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        // Auto-inkrementerande seq ger en stabil FIFO-ordning för replay.
        db.createObjectStore(OUTBOX_STORE, { keyPath: "seq", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// --- Läs-cache (fas 1) ---

/** Abstrakt cache-baksida så OfflineStore kan testas utan en riktig IndexedDB. */
export interface CacheBackend {
  get<T>(userId: string, resource: string): Promise<T | undefined>;
  put(userId: string, resource: string, value: unknown): Promise<void>;
  /** Rensa all cache för en användare (vid utloggning/kontobyte). */
  clearUser(userId: string): Promise<void>;
}

function cacheKey(userId: string, resource: string) {
  return `${userId}:${resource}`;
}

/** IndexedDB-baserad läs-cache. Standard-backend för OfflineStore. */
export const idbCache: CacheBackend = {
  async get<T>(userId: string, resource: string): Promise<T | undefined> {
    const v = await run<T | undefined>(CACHE_STORE, "readonly", (s) =>
      s.get(cacheKey(userId, resource)),
    );
    return v ?? undefined;
  },
  async put(userId: string, resource: string, value: unknown): Promise<void> {
    await run(CACHE_STORE, "readwrite", (s) =>
      s.put(value, cacheKey(userId, resource)),
    );
  },
  async clearUser(userId: string): Promise<void> {
    const prefix = `${userId}:`;
    await run(CACHE_STORE, "readwrite", (s) => {
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

// --- Outbox (fas 2) ---

/** Skrivningar som köas för uppspelning mot servern. Matchar DataStore-metoderna. */
export type OutboxKind =
  | "saveActivity"
  | "deleteActivity"
  | "saveFrequencySettings"
  | "saveSchedule"
  | "saveNotificationPrefs"
  | "saveNudge"
  | "saveEngineState";

export interface OutboxOp {
  /** Auto-inkrementerad nyckel → FIFO-ordning vid replay. */
  seq: number;
  userId: string;
  kind: OutboxKind;
  payload: unknown;
  createdAt: string;
}

/** Abstrakt outbox-baksida så OfflineStore kan testas utan en riktig IndexedDB. */
export interface OutboxBackend {
  enqueue(userId: string, kind: OutboxKind, payload: unknown): Promise<void>;
  /** Köade ops för en användare, i seq-ordning (äldst först). */
  list(userId: string): Promise<OutboxOp[]>;
  remove(seq: number): Promise<void>;
  clearUser(userId: string): Promise<void>;
}

/** IndexedDB-baserad outbox. Standard-backend för OfflineStore. */
export const idbOutbox: OutboxBackend = {
  async enqueue(userId, kind, payload): Promise<void> {
    await run(OUTBOX_STORE, "readwrite", (s) =>
      // seq utelämnas → autoIncrement tilldelar nästa värde.
      s.add({ userId, kind, payload, createdAt: new Date().toISOString() }),
    );
  },
  async list(userId): Promise<OutboxOp[]> {
    const all = await run<OutboxOp[]>(OUTBOX_STORE, "readonly", (s) =>
      s.getAll(),
    );
    // getAll ger redan seq-ordning (nyckelordning), men filtrera per användare.
    return (all ?? []).filter((op) => op.userId === userId);
  },
  async remove(seq): Promise<void> {
    await run(OUTBOX_STORE, "readwrite", (s) => s.delete(seq));
  },
  async clearUser(userId): Promise<void> {
    await run(OUTBOX_STORE, "readwrite", (s) => {
      const req = s.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if ((cursor.value as OutboxOp).userId === userId) cursor.delete();
        cursor.continue();
      };
      return req;
    });
  },
};
