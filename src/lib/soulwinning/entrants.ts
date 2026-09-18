/**
 * "No login" identity. The device remembers who is entering; switching to
 * someone who has entered on this device before never re-asks for their details.
 * A short login_code lets the same member open the app on another phone.
 */

import { pfccForFellowship } from "./fellowships";
import { newId } from "./id";
import { normalizeLoginCode, uniqueLoginCode } from "./login-code";
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

async function withLoginCodes(entrants: LocalEntrant[]): Promise<LocalEntrant[]> {
  const codes = entrants.map((entrant) => entrant.login_code).filter(Boolean);
  const next: LocalEntrant[] = [];

  for (const entrant of entrants) {
    if (entrant.login_code) {
      next.push(entrant);
      continue;
    }

    const login_code = await uniqueLoginCode(codes);
    codes.push(login_code);
    const patched: LocalEntrant = { ...entrant, login_code, synced: 0 };
    await putRecord(ENTRANTS_STORE, patched);
    next.push(patched);
  }

  return next;
}

/** Everyone who has entered on this device, most recent first. */
export async function listEntrants(): Promise<LocalEntrant[]> {
  const entrants = await withLoginCodes(await getAll<LocalEntrant>(ENTRANTS_STORE));
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
};

export async function createEntrant(draft: EntrantDraft): Promise<LocalEntrant> {
  const fellowship = draft.fellowship.trim();
  const login_code = await uniqueLoginCode((await listEntrants()).map((row) => row.login_code));
  const entrant: LocalEntrant = {
    id: newId(),
    device_id: getDeviceId(),
    name: draft.name.trim(),
    fellowship,
    phone: draft.phone.trim(),
    pfcc: pfccForFellowship(fellowship) ?? "",
    login_code,
    created_at: new Date().toISOString(),
    synced: 0,
    attempts: 0,
    next_attempt_at: 0,
  };

  await putRecord(ENTRANTS_STORE, entrant);
  setActiveEntrantId(entrant.id);
  return entrant;
}

export type CodeLoginResult =
  | { ok: true; entrant: LocalEntrant }
  | { ok: false; error: string };

export async function adoptEntrantByCode(raw: string): Promise<CodeLoginResult> {
  const code = normalizeLoginCode(raw);
  if (code.length !== 4) {
    return { ok: false, error: "A login code is 4 letters and numbers." };
  }

  const local = (await listEntrants()).find((entrant) => normalizeLoginCode(entrant.login_code) === code);
  if (local) {
    setActiveEntrantId(local.id);
    return { ok: true, entrant: local };
  }

  try {
    const response = await fetch("/api/soulwinning/login-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (response.status === 404) {
      return {
        ok: false,
        error: "No member with that code yet. Check it, or wait until the first phone is online.",
      };
    }

    if (!response.ok) {
      return { ok: false, error: "Could not look that up. Try again." };
    }

    const row = (await response.json()) as {
      id: string;
      name: string;
      fellowship: string | null;
      phone: string | null;
      pfcc: string | null;
      login_code: string;
      created_at: string;
    };

    const already = (await listEntrants()).find((entrant) => entrant.id === row.id);
    if (already) {
      setActiveEntrantId(already.id);
      return { ok: true, entrant: already };
    }

    const entrant: LocalEntrant = {
      id: row.id,
      device_id: getDeviceId(),
      name: row.name,
      fellowship: row.fellowship ?? "",
      phone: row.phone ?? "",
      pfcc: row.pfcc ?? "",
      login_code: row.login_code,
      created_at: row.created_at,
      synced: 1,
      attempts: 0,
      next_attempt_at: 0,
    };

    await putRecord(ENTRANTS_STORE, entrant);
    setActiveEntrantId(entrant.id);
    return { ok: true, entrant };
  } catch {
    return { ok: false, error: "Could not look that up. Check your connection and try again." };
  }
}
