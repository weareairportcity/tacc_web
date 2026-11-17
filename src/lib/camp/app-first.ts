import { query } from "@/lib/cf";
import { checkId } from "./camps";
import type { Camp, Registration } from "./types";

/**
 * App first: attendees put Commune on their Home Screen and turn on
 * notifications, then get app notifications (free) instead of texts. A person
 * who can't ("My phone can't do this") is marked texts only and keeps getting
 * texts. Coordinators see where everyone stands on People and Today.
 */

/** Has a phone with notifications on for this registration (camp_push_subs). */
export const HAS_PUSH_SQL = "EXISTS (SELECT 1 FROM camp_push_subs s WHERE s.owner = 'attendee:' || r.id)";

/** on: notifications on · installed: app on the Home Screen, notifications off · texts: chose texts · none: not yet. */
export type AppState = "on" | "installed" | "texts" | "none";
export const APP_STATE_SQL = `CASE WHEN ${HAS_PUSH_SQL} THEN 'on' WHEN r.texts_only_at IS NOT NULL THEN 'texts' WHEN r.app_installed_at IS NOT NULL THEN 'installed' ELSE 'none' END`;

export { APP_STATE_WORDS } from "./app-words";

export type AppInfo = { installed: boolean; push: boolean; textsOnly: boolean };

export async function appInfo(registrationId: string): Promise<AppInfo> {
  const [row] = await query<{ installed: number; push: number; texts: number }>(
    "app",
    `SELECT r.app_installed_at IS NOT NULL AS installed, ${HAS_PUSH_SQL} AS push, r.texts_only_at IS NOT NULL AS texts
     FROM camp_registrations r WHERE r.id = ?`,
    [checkId(registrationId, "registration")],
  );
  return { installed: !!row?.installed, push: !!row?.push, textsOnly: !!row?.texts };
}

const PLATFORMS = new Set(["ios", "android", "desktop"]);

/** Commune was opened from the Home Screen (or Android said it was installed). The first time is kept. */
export async function markInstalled(registrationId: string, platform: string) {
  await query(
    "app",
    "UPDATE camp_registrations SET app_installed_at = COALESCE(app_installed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), app_platform = ? WHERE id = ?",
    [PLATFORMS.has(platform) ? platform : "", checkId(registrationId, "registration")],
  );
}

/** "My phone can't do this": texts as before, and the page stops asking. */
export async function setTextsOnly(registrationId: string, on: boolean) {
  await query(
    "app",
    `UPDATE camp_registrations SET texts_only_at = ${on ? "COALESCE(texts_only_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))" : "NULL"} WHERE id = ?`,
    [checkId(registrationId, "registration")],
  );
}

/** Phones and tablets that say so. iPads asking for the desktop site look like a Mac and aren't asked. */
export const isPhone = (userAgent: string) => /iPhone|iPad|iPod|Android/i.test(userAgent);

/**
 * Whether this attendee must set up the app before seeing their page: the
 * camp asks for it, they're on a phone, and they don't have the app with
 * notifications on yet (or chose texts).
 */
export function mustSetUpApp(camp: Pick<Camp, "app_required">, me: Pick<Registration, "status">, info: AppInfo, userAgent: string) {
  if (!camp.app_required || me.status === "cancelled" || info.textsOnly || !isPhone(userAgent)) return false;
  return !(info.installed && info.push);
}
