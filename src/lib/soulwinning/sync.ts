/**
 * Background sync queue.
 *
 * Nothing here is ever awaited by the entry form — a save is done the moment it
 * hits IndexedDB, and this pushes it to Supabase whenever the network allows,
 * retrying with backoff. Entrants sync before entries because an entry's
 * entrant_id is a foreign key.
 */

import { SwApiError, swPost, swPutPhoto } from "./api";
import { openDb, ENTRIES_STORE as ENTRIES } from "./local-db";
import {
  ENTRANTS_STORE,
  ENTRIES_STORE,
  countUnsynced,
  getUnsynced,
  markFailed,
  markSynced,
  markUnsynced,
  type LocalEntrant,
  type LocalEntry,
} from "./local-db";
import { makeThumbnail, photoAsBlob, thumbPath } from "./photo";

const CHUNK_SIZE = 50;
const POLL_INTERVAL_MS = 15_000;
/** The Worker's 409 when an entry's member hasn't reached it yet (workers/soulwinning/src/public.ts). */
const ENTRANT_MISSING = "entrant not synced yet";

export type SyncState = {
  pending: number;
  syncing: boolean;
  online: boolean;
  lastError: string | null;
};

let state: SyncState = { pending: 0, syncing: false, online: true, lastError: null };
const listeners = new Set<(state: SyncState) => void>();
let inFlight: Promise<void> | null = null;
// A save that lands while a pass is running would otherwise wait for the next
// 15-second poll; instead, run one more pass straight after.
let rerun = false;
let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

function emit(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function subscribeToSync(listener: (state: SyncState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function getSyncState(): SyncState {
  return state;
}

export async function refreshPendingCount(): Promise<void> {
  const [entrants, entries] = await Promise.all([
    countUnsynced(ENTRANTS_STORE),
    countUnsynced(ENTRIES_STORE),
  ]);
  emit({ pending: entrants + entries });
}

/**
 * Sends a batch to the soul winning API. The server ignores ids it already
 * has, so a retry after a flaky connection is always safe.
 */
async function insertRows(
  endpoint: "/v1/entrants" | "/v1/entries",
  rows: Record<string, unknown>[]
): Promise<{ ok: boolean; error: string | null }> {
  try {
    await swPost(endpoint, { rows });
    return { ok: true, error: null };
  } catch (error) {
    if (error instanceof SwApiError) return { ok: false, error: error.message };
    return { ok: false, error: "network error" };
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function ready<T extends { next_attempt_at: number }>(rows: T[]): T[] {
  const now = Date.now();
  return rows.filter((row) => (row.next_attempt_at ?? 0) <= now);
}

async function pushEntrants(): Promise<boolean> {
  const pending = ready(await getUnsynced<LocalEntrant>(ENTRANTS_STORE));
  if (pending.length === 0) return true;

  let allOk = true;

  for (const batch of chunk(pending, CHUNK_SIZE)) {
    const rows = batch.map((entrant) => ({
      id: entrant.id,
      device_id: entrant.device_id,
      name: entrant.name,
      fellowship: entrant.fellowship || null,
      phone: entrant.phone || null,
      pfcc: entrant.pfcc || null,
      login_code: entrant.login_code || null,
      created_at: entrant.created_at,
    }));

    const { ok, error } = await insertRows("/v1/entrants", rows);

    if (ok) {
      await markSynced(ENTRANTS_STORE, batch.map((entrant) => entrant.id));
    } else {
      await markFailed(ENTRANTS_STORE, batch.map((entrant) => entrant.id), error ?? "insert failed");
      emit({ lastError: error });
      allOk = false;
    }
  }

  return allOk;
}

/**
 * Pushes a queued photo to storage and marks it done locally.
 *
 * Photos go up before their row so that by the time the entry lands, the
 * counter can already show the picture. A failed upload never blocks the
 * entry: the soul is recorded either way and the photo retries on the next
 * pass.
 */
async function uploadPhoto(entry: LocalEntry): Promise<boolean> {
  if (!entry.photo_path) return true;
  if (entry.photo_uploaded) return true;
  if (!entry.photo) {
    // A path with no blob means the image was lost locally (storage cleared
    // mid-queue). Nothing to upload, and retrying forever would wedge the
    // entry, so let it through — the soul still counts, just without a photo.
    return true;
  }

  // Thumbnail first (the counter marquee uses it), then the full photo. Both
  // uploads are idempotent: the server answers "already there" as success.
  const full = photoAsBlob(entry.photo);
  const thumb = await makeThumbnail(full);
  const thumbOk = thumb ? await swPutPhoto(thumbPath(entry.photo_path), thumb) : true;
  const fullOk = await swPutPhoto(entry.photo_path, full);
  if (!thumbOk || !fullOk) {
    emit({ lastError: "photo: upload failed" });
    return false;
  }

  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(ENTRIES, "readwrite");
    const store = tx.objectStore(ENTRIES);
    const get = store.get(entry.id);
    get.onsuccess = () => {
      const record = get.result;
      if (record) {
        record.photo_uploaded = true;
        record.photo = null; // free the blob once it is safely in storage
        store.put(record);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });

  return true;
}

async function pushEntries(): Promise<void> {
  const pending = ready(await getUnsynced<LocalEntry>(ENTRIES_STORE));
  if (pending.length === 0) return;

  for (const batch of chunk(pending, CHUNK_SIZE)) {
    // Photos first, so the counter has the picture the moment the row lands.
    const photoResults = await Promise.all(batch.map((entry) => uploadPhoto(entry)));

    const rows = batch.map((entry) => ({
      id: entry.id,
      campaign_id: entry.campaign_id,
      entrant_id: entry.entrant_id,
      group_id: entry.group_id,
      soul_name: entry.soul_name,
      phone: entry.phone || null,
      latitude: entry.latitude,
      longitude: entry.longitude,
      spoke_in_tongues: entry.spoke_in_tongues,
      coming_to_church: entry.coming_to_church,
      photo_path: entry.photo_path,
      // created_at is the device's clock (so a late sync still lands in the
      // right hour); synced_at is left to the server default, which is the
      // only trustworthy record of when the row actually arrived.
      created_at: entry.created_at,
    }));

    const { ok, error } = await insertRows("/v1/entries", rows);

    if (!ok) {
      // The phone thinks the member is synced but the server has never seen
      // them: a profile left in this browser from 1909 (Supabase). Queue the
      // member again so the next pass sends them first, then these souls.
      if (error === ENTRANT_MISSING) {
        await markUnsynced(ENTRANTS_STORE, [...new Set(batch.map((entry) => entry.entrant_id))]);
        rerun = true;
      }
      await markFailed(ENTRIES_STORE, batch.map((entry) => entry.id), error ?? "insert failed");
      emit({ lastError: error });
      continue;
    }

    // An entry counts as synced only once its row AND its photo are up. The
    // row insert is idempotent, so leaving a photo-only failure unsynced
    // simply retries the photo on the next pass instead of losing it.
    const done = batch.filter((_, index) => photoResults[index]);
    const photoPending = batch.filter((_, index) => !photoResults[index]);

    await markSynced(ENTRIES_STORE, done.map((entry) => entry.id));
    if (photoPending.length > 0) {
      await markFailed(ENTRIES_STORE, photoPending.map((entry) => entry.id), "photo upload failed");
    }
  }
}

export function syncNow(): Promise<void> {
  if (inFlight) {
    rerun = true;
    return inFlight;
  }

  inFlight = (async () => {
    // Every exit path runs the finally — an early return that skipped it would
    // leave this promise latched as "in flight" forever and silently kill the
    // queue the first time a device went offline.
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        emit({ online: false });
        return;
      }

      emit({ syncing: true, online: true });

      // An entry whose entrant has not landed yet would fail the foreign key,
      // so hold the entries back for the next pass instead.
      const entrantsOk = await pushEntrants();
      if (entrantsOk) {
        await pushEntries();
        emit({ lastError: null });
      }
    } catch (error) {
      emit({ lastError: error instanceof Error ? error.message : "sync failed" });
    } finally {
      await refreshPendingCount();
      emit({ syncing: false });
      inFlight = null;
      if (rerun) {
        rerun = false;
        setTimeout(() => void syncNow(), 0);
      }
    }
  })();

  return inFlight;
}

/** Starts the queue: syncs now, on reconnect, on tab focus, and on a slow poll. */
export function startSync(): () => void {
  if (started) return () => {};
  started = true;

  emit({ online: typeof navigator === "undefined" ? true : navigator.onLine });

  const onOnline = () => {
    emit({ online: true });
    void syncNow();
  };
  const onOffline = () => emit({ online: false });
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  timer = setInterval(() => void syncNow(), POLL_INTERVAL_MS);

  void syncNow();

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    if (timer) clearInterval(timer);
    started = false;
  };
}
