import { query } from "@/lib/cf";
import { COMMUNE_SENDER, sendSMS } from "@/lib/mnotify";
import { smsPartsOf } from "@/lib/sms-plain";
import { checkId } from "./camps";

/**
 * Every Commune text is counted here with the mNotify credits it used, so the
 * Texts page can say what each kind of text costs. One row per send: a message
 * to 120 people is one row. The Worker writes its own (receipts, the evening
 * summary) to the same table.
 */

export type SmsKind = "registration" | "code" | "receipt" | "room" | "thanks" | "message" | "broadcast" | "summary" | "alert" | "arrival_details" | "payment_moved";

export async function logCampSms(row: { campId: string; kind: SmsKind; texts: number; credits: number; pushed?: number; actor?: string; note?: string }) {
  if (row.texts <= 0 && !row.pushed) return;
  await query(
    "app",
    "INSERT INTO camp_sms_log (camp_id, kind, texts, credits, pushed, actor, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [checkId(row.campId, "camp"), row.kind, row.texts, row.credits, row.pushed ?? 0, row.actor ?? "", (row.note ?? "").slice(0, 400)],
  ).catch((err) => console.error("sms log", err));
}

/** One Commune text to one person, counted. */
export async function sendCampText(campId: string, kind: SmsKind, to: string, text: string) {
  const ok = await sendSMS(to, text, COMMUNE_SENDER).catch(() => false);
  if (ok) await logCampSms({ campId, kind, texts: 1, credits: smsPartsOf(text) });
  return ok;
}

export const SMS_KIND_WORDS: Record<SmsKind, string> = {
  registration: "Sign-in codes when they register",
  code: "New sign-in codes",
  receipt: "Payment receipts",
  room: "Room texts",
  thanks: "Thank-you after camp",
  message: "Your messages to people you picked",
  broadcast: "Texts to everyone",
  summary: "Evening summary to coordinators",
  alert: "Payment alerts",
  arrival_details: "Arrival and health reminder",
  payment_moved: "Texts about a moved payment",
};

export type SmsUse = { kind: SmsKind; texts: number; credits: number; pushed: number };

/** Credits used by this camp, by kind, most first. */
export async function smsUse(campId: string) {
  return query<SmsUse>(
    "app",
    "SELECT kind, SUM(texts) AS texts, SUM(credits) AS credits, SUM(pushed) AS pushed FROM camp_sms_log WHERE camp_id = ? GROUP BY kind ORDER BY credits DESC",
    [checkId(campId, "camp")],
  );
}

export type Broadcast = { id: number; created_at: string; texts: number; credits: number; pushed: number; actor: string; note: string };

/** The texts sent to everyone, newest first. */
export function listBroadcasts(campId: string) {
  return query<Broadcast>(
    "app",
    "SELECT id, created_at, texts, credits, pushed, actor, note FROM camp_sms_log WHERE camp_id = ? AND kind = 'broadcast' ORDER BY created_at DESC LIMIT 20",
    [checkId(campId, "camp")],
  );
}
