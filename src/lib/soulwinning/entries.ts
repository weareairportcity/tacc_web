import { newId } from "./id";
import { ENTRIES_STORE, putRecord, type LocalEntry } from "./local-db";
import { photoPath } from "./photo";

export type Coords = { latitude: number; longitude: number } | null;

export type SoulDraft = {
  soul_name: string;
  phone: string;
  spoke_in_tongues: boolean;
  coming_to_church: boolean;
  /** Optional — already compressed by the time it gets here. */
  photo: Blob | null;
};

/**
 * Best-effort device location. A denied permission or a slow fix must never
 * block a save (plan §7) — the entry is simply queued without coordinates and
 * stays out of the map rather than being lost.
 */
export function getCurrentCoords(timeoutMs = 8000): Promise<Coords> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (coords: Coords) => {
      if (settled) return;
      settled = true;
      resolve(coords);
    };

    // Our own timer, not just PositionOptions.timeout: while a permission
    // prompt sits unanswered the browser calls neither callback and its
    // timeout never starts, which would leave this promise pending forever.
    const timer = setTimeout(() => finish(null), timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        finish({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 }
    );
  });
}

/** Has this device already granted location, so the prompt can be skipped? */
export async function hasLocationPermission(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return false;
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state === "granted";
  } catch {
    // Safari has shipped this only recently; fall back to asking.
    return false;
  }
}

/**
 * Writes a whole submission group to IndexedDB. Every soul entered in one
 * sitting shares a group_id and the first soul's location (plan §6).
 */
export async function saveSoulGroup(args: {
  campaignId: string;
  entrantId: string;
  souls: SoulDraft[];
  coords: Coords;
}): Promise<LocalEntry[]> {
  const groupId = newId();
  const now = new Date().toISOString();

  const entries: LocalEntry[] = args.souls.map((soul) => {
    const id = newId();
    return {
    id,
    campaign_id: args.campaignId,
    entrant_id: args.entrantId,
    group_id: groupId,
    soul_name: soul.soul_name.trim(),
    phone: soul.phone.trim(),
    latitude: args.coords?.latitude ?? null,
    longitude: args.coords?.longitude ?? null,
    spoke_in_tongues: soul.spoke_in_tongues,
    coming_to_church: soul.coming_to_church,
    created_at: now,
    photo: soul.photo,
    photo_path: soul.photo ? photoPath(args.campaignId, id) : null,
    photo_uploaded: false,
    synced: 0,
    attempts: 0,
    next_attempt_at: 0,
    last_error: null,
    };
  });

  for (const entry of entries) {
    await putRecord(ENTRIES_STORE, entry);
  }

  return entries;
}
