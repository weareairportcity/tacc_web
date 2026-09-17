/**
 * "No login" identity. The device remembers who is entering; switching to
 * someone who has entered on this device before never re-asks for their details.
 */

import { newId } from "./id";
import { ENTRANTS_STORE, getAll, putRecord, type LocalEntrant } from "./local-db";

const DEVICE_KEY = "sw1909:device_id";
const ACTIVE_KEY = "sw1909:active_entrant_id";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = newId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getActiveEntrantId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveEntrantId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

/** Everyone who has entered on this device, most recent first. */
export async function listEntrants(): Promise<LocalEntrant[]> {
  const entrants = await getAll<LocalEntrant>(ENTRANTS_STORE);
  return entrants.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getActiveEntrant(): Promise<LocalEntrant | null> {
  const id = getActiveEntrantId();
  if (!id) return null;
  const entrants = await listEntrants();
  return entrants.find((entrant) => entrant.id === id) ?? null;
}

export type EntrantDraft = {
  name: string;
  fellowship: string;
  phone: string;
  pfcc: string;
};

export async function createEntrant(draft: EntrantDraft): Promise<LocalEntrant> {
  const entrant: LocalEntrant = {
    id: newId(),
    device_id: getDeviceId(),
    name: draft.name.trim(),
    fellowship: draft.fellowship.trim(),
    phone: draft.phone.trim(),
    pfcc: draft.pfcc.trim(),
    created_at: new Date().toISOString(),
    synced: 0,
    attempts: 0,
    next_attempt_at: 0,
  };

  await putRecord(ENTRANTS_STORE, entrant);
  setActiveEntrantId(entrant.id);
  return entrant;
}
