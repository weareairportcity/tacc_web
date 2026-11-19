import { post } from "@/lib/cf";
import { CampError } from "./types";

/**
 * App notifications: saving a phone's subscription and what its owner turned
 * off. The Worker keeps them and sends (workers/soulwinning/src/notify.ts).
 * owner is "attendee:<registration id>" or "staff:<email>".
 */

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };
export type NotifyPrefs = { off: string[]; devices: number; key: string | null };

/** `keep`: other leader codes on this phone that keep getting notifications on it. */
export async function savePushSub(owner: string, raw: unknown, keep: string[] = []) {
  const sub = (raw ?? {}) as Partial<PushSubscriptionInput>;
  if (typeof sub.endpoint !== "string" || !sub.keys) throw new CampError("Couldn't turn on notifications on this phone.");
  await post("/v1/admin/camp/push-subscribe", { owner, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, ...(keep.length ? { keep } : {}) });
}

/** owner: only this person's use of the phone (another app on it may still want notifications). */
export async function removePushSub(endpoint: string, owner?: string) {
  await post("/v1/admin/camp/push-subscribe", { endpoint: String(endpoint), remove: true, ...(owner ? { owner } : {}) });
}

export function notifyPrefs(owner: string, off?: string[]): Promise<NotifyPrefs> {
  return post<NotifyPrefs>("/v1/admin/camp/notify-prefs", off ? { owner, off } : { owner });
}
