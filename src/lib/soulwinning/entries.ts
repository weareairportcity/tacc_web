import { getDeviceId } from "./entrants";
import { newId } from "./id";
import {
  ENTRIES_STORE,
  deleteRecords,
  getRecord,
  putRecord,
  type LocalEntry,
} from "./local-db";
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
    await putEntry(entry);
  }

  return entries;
}

/** IndexedDB on some iPhones rejects a photo blob. Keep the soul anyway. */
async function putEntry(entry: LocalEntry): Promise<void> {
  try {
    await putRecord(ENTRIES_STORE, entry);
  } catch (error) {
    if (!entry.photo) throw error;
    await putRecord(ENTRIES_STORE, { ...entry, photo: null, photo_path: null });
  }
}

const MAX_PARTY = 500;

export type GroupDraft = {
  name: string;
  contact: string;
  souls: number;
  tongues: number;
  church: number;
  photo: Blob | null;
};

/**
 * One class, one crowd, one altar call: N counted souls from a single form.
 * Each soul is its own row so the existing hall counter still moves by N,
 * without a schema change on event day. Only the first row carries the
 * contact number (so the duplicate net does not swallow the rest) and the
 * optional photo.
 */
export async function saveGroupParty(args: {
  campaignId: string;
  entrantId: string;
  draft: GroupDraft;
  coords: Coords;
}): Promise<LocalEntry[]> {
  const souls = Math.min(MAX_PARTY, Math.max(1, Math.floor(args.draft.souls)));
  const tongues = Math.min(souls, Math.max(0, Math.floor(args.draft.tongues)));
  const church = Math.min(souls, Math.max(0, Math.floor(args.draft.church)));
  const name = args.draft.name.trim();
  const contact = args.draft.contact.trim();
  const groupId = newId();
  const now = new Date().toISOString();

  const entries: LocalEntry[] = [];
  for (let index = 0; index < souls; index += 1) {
    const id = newId();
    const isLead = index === 0;
    entries.push({
      id,
      campaign_id: args.campaignId,
      entrant_id: args.entrantId,
      group_id: groupId,
      soul_name: name,
      phone: isLead ? contact : "",
      latitude: args.coords?.latitude ?? null,
      longitude: args.coords?.longitude ?? null,
      spoke_in_tongues: index < tongues,
      coming_to_church: index < church,
      created_at: now,
      photo: isLead ? args.draft.photo : null,
      photo_path: isLead && args.draft.photo ? photoPath(args.campaignId, id) : null,
      photo_uploaded: false,
      synced: 0,
      attempts: 0,
      next_attempt_at: 0,
      last_error: null,
      party_size: souls,
      bulk: true,
    });
  }

  for (const entry of entries) {
    await putEntry(entry);
  }

  return entries;
}

const SHOT_CAMPAIGN_ID = "shot-campaign";

/**
 * Removes souls from this phone, and from the hall if they have already
 * synced. Only rows this device originally logged can be removed on the
 * server — the API checks device_id so one phone cannot wipe another's work.
 */
export async function deleteLocalEntries(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;

  const found: LocalEntry[] = [];
  for (const id of unique) {
    const row = await getRecord<LocalEntry>(ENTRIES_STORE, id);
    if (row) found.push(row);
  }
  if (found.length === 0) return;

  const live = found.filter(
    (row) => row.synced === 1 && row.campaign_id !== SHOT_CAMPAIGN_ID
  );
  if (live.length > 0) {
    const response = await fetch("/api/soulwinning/entries/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: live.map((row) => row.id),
        device_id: getDeviceId(),
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Could not delete from the hall");
    }
  }

  await deleteRecords(
    ENTRIES_STORE,
    found.map((row) => row.id)
  );
}

export type RemoteSoul = {
  id: string;
  campaign_id: string;
  entrant_id: string;
  group_id: string;
  soul_name: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  spoke_in_tongues: boolean;
  coming_to_church: boolean;
  created_at: string;
  photo_path: string | null;
};

/** Souls already on the hall for this member's login code. */
export async function fetchRemoteEntries(args: {
  loginCode: string;
  campaignId: string;
}): Promise<LocalEntry[]> {
  if (!args.loginCode || args.campaignId === SHOT_CAMPAIGN_ID) return [];

  try {
    const response = await fetch("/api/soulwinning/entries/mine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: args.loginCode, campaign_id: args.campaignId }),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { entries?: RemoteSoul[] };
    return (body.entries ?? []).map(remoteToLocal);
  } catch {
    return [];
  }
}

function remoteToLocal(row: RemoteSoul): LocalEntry {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    entrant_id: row.entrant_id,
    group_id: row.group_id,
    soul_name: row.soul_name,
    phone: row.phone ?? "",
    latitude: row.latitude,
    longitude: row.longitude,
    spoke_in_tongues: row.spoke_in_tongues,
    coming_to_church: row.coming_to_church,
    created_at: row.created_at,
    photo: null,
    photo_path: row.photo_path,
    photo_uploaded: Boolean(row.photo_path),
    synced: 1,
    attempts: 0,
    next_attempt_at: 0,
    last_error: null,
  };
}
