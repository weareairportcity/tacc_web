/**
 * The device's own copy of everything logged in the field.
 *
 * Every soul lands here first and is only then pushed to Supabase, so a dropped
 * connection can never cost an entry. Deliberately dependency-free — a thin
 * IndexedDB wrapper rather than another package in the bundle.
 */

const DB_NAME = "sw1909";
const DB_VERSION = 1;

export const ENTRANTS_STORE = "entrants";
export const ENTRIES_STORE = "entries";

/** 0 / 1 rather than a boolean: IndexedDB cannot index booleans. */
export type SyncFlag = 0 | 1;

export type LocalEntrant = {
  id: string;
  device_id: string;
  name: string;
  fellowship: string;
  phone: string;
  pfcc: string;
  login_code: string;
  created_at: string;
  synced: SyncFlag;
  attempts: number;
  next_attempt_at: number;
};

export type LocalEntry = {
  id: string;
  campaign_id: string;
  entrant_id: string;
  group_id: string;
  soul_name: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  spoke_in_tongues: boolean;
  coming_to_church: boolean;
  created_at: string;
  /** The compressed image, held on the device until it reaches storage. */
  photo: Blob | null;
  photo_path: string | null;
  photo_uploaded: boolean;
  synced: SyncFlag;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  /** How many souls this row represents. 1 for a person; N for each row in a group save. */
  party_size?: number;
  /** True when this row is part of a class / crowd save, not one-by-one names. */
  bulk?: boolean;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ENTRANTS_STORE)) {
        const entrants = db.createObjectStore(ENTRANTS_STORE, { keyPath: "id" });
        entrants.createIndex("synced", "synced");
      }

      if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
        const entries = db.createObjectStore(ENTRIES_STORE, { keyPath: "id" });
        entries.createIndex("synced", "synced");
        entries.createIndex("entrant_id", "entrant_id");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab"));
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    let db = await open();

    // A database left at the right version but missing its stores (an upgrade
    // interrupted mid-flight) would fail every read and write from here on.
    // Rebuild it rather than leaving the device unable to log anything.
    if (!db.objectStoreNames.contains(ENTRANTS_STORE) || !db.objectStoreNames.contains(ENTRIES_STORE)) {
      db.close();
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
      db = await open();
    }

    return db;
  })().catch((error) => {
    dbPromise = null; // let the next attempt try again
    throw error;
  });

  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = fn(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export function putRecord<T extends LocalEntrant | LocalEntry>(store: string, record: T): Promise<IDBValidKey> {
  return run(store, "readwrite", (s) => s.put(record));
}

export function getRecord<T>(store: string, id: string): Promise<T | undefined> {
  return run<T | undefined>(store, "readonly", (s) => s.get(id) as IDBRequest<T | undefined>);
}

export function getAll<T>(store: string): Promise<T[]> {
  return run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
}

/** Everything still waiting to reach Supabase, oldest first. */
export async function getUnsynced<T extends { created_at: string }>(store: string): Promise<T[]> {
  const rows = await run<T[]>(store, "readonly", (s) => s.index("synced").getAll(0) as IDBRequest<T[]>);
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function countUnsynced(store: string): Promise<number> {
  return run<number>(store, "readonly", (s) => s.index("synced").count(0));
}

/** How many souls this entrant has logged on this device for a campaign — drives the milestone toast. */
export async function countEntriesByEntrant(entrantId: string, campaignId: string): Promise<number> {
  const rows = await listEntriesByEntrant(entrantId, campaignId);
  return rows.length;
}

/** Souls this member logged on this phone, newest first. */
export async function listEntriesByEntrant(entrantId: string, campaignId: string): Promise<LocalEntry[]> {
  const rows = await run<LocalEntry[]>(
    ENTRIES_STORE,
    "readonly",
    (s) => s.index("entrant_id").getAll(entrantId) as IDBRequest<LocalEntry[]>
  );
  return rows
    .filter((row) => row.campaign_id === campaignId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function markSynced(store: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);

    for (const id of ids) {
      const get = objectStore.get(id);
      get.onsuccess = () => {
        const record = get.result;
        if (!record) return;
        record.synced = 1;
        record.last_error = null;
        objectStore.put(record);
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteRecords(store: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);
    for (const id of ids) objectStore.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Exponential backoff, capped at a minute, with jitter so devices don't retry in lockstep. */
export function backoffDelay(attempts: number): number {
  const base = Math.min(1000 * 2 ** attempts, 60_000);
  return base + Math.random() * 500;
}

export async function markFailed(store: string, ids: string[], error: string): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);

    for (const id of ids) {
      const get = objectStore.get(id);
      get.onsuccess = () => {
        const record = get.result;
        if (!record) return;
        record.attempts = (record.attempts ?? 0) + 1;
        record.next_attempt_at = Date.now() + backoffDelay(record.attempts);
        record.last_error = error;
        objectStore.put(record);
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
