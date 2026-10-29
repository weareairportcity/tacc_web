import { sendSms } from "./sms";
import type { AppEnv } from "./util";

/**
 * The coordinators' evening text: one SMS per camp per day at 7 pm Ghana
 * time (UTC), to every admin and coordinator with a phone saved on Settings.
 * camp_daily_summaries records the send, so the hourly cron never sends twice.
 */

export const SUMMARY_HOUR_UTC = 19;
/** A room type at or under this many places left is called out. */
const LOW_PLACES = 5;

const cedis = (pesewas: number) => `GHS ${Math.round(pesewas / 100).toLocaleString("en-GH")}`;

type Numbers = { registered: number; money: number; flagged: number; requests: number; low: { name: string; gender: string; places_left: number }[] };

async function numbers(env: AppEnv, campId: string, day: string): Promise<Numbers> {
  const db = env.APP_DB;
  const [reg, money, flagged, requests, low] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM camp_registrations WHERE camp_id = ? AND substr(created_at, 1, 10) = ?").bind(campId, day).first<{ n: number }>(),
    db.prepare(
      `SELECT COALESCE(SUM(p.amount_pesewas), 0) AS n FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id
       WHERE r.camp_id = ? AND p.status = 'success' AND substr(p.paid_at, 1, 10) = ?`,
    ).bind(campId, day).first<{ n: number }>(),
    db.prepare(
      `SELECT COUNT(*) AS n FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id
       WHERE r.camp_id = ? AND p.flag IN ('amount_mismatch', 'over_balance')`,
    ).bind(campId).first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM camp_requests WHERE camp_id = ? AND status = 'pending'").bind(campId).first<{ n: number }>(),
    db.prepare(
      `SELECT t.name, p.gender, p.places_left FROM camp_room_type_places p JOIN camp_room_types t ON t.id = p.room_type_id
       WHERE t.camp_id = ? AND p.places_left <= ? ORDER BY p.places_left`,
    ).bind(campId, LOW_PLACES).all<{ name: string; gender: string; places_left: number }>(),
  ]);
  return { registered: reg?.n ?? 0, money: money?.n ?? 0, flagged: flagged?.n ?? 0, requests: requests?.n ?? 0, low: low.results ?? [] };
}

export function summaryText(campName: string, n: Numbers) {
  const parts = [`${n.registered} new`, `${cedis(n.money)} in`];
  const low = n.low.map((l) => `${l.name} ${l.gender === "male" ? "men" : "women"} ${l.places_left === 0 ? "full" : `${l.places_left} left`}`);
  const todo = [n.requests && `${n.requests} request${n.requests === 1 ? "" : "s"}`, n.flagged && `${n.flagged} payment${n.flagged === 1 ? "" : "s"} to check`].filter(Boolean);
  return [`Good evening! ${campName} today: ${parts.join(", ")}.`, low.length ? `${low.join(", ")}.` : "", todo.length ? `Waiting: ${todo.join(", ")}.` : "", "- The Airport City Church"]
    .filter(Boolean)
    .join(" ");
}

export async function sendDailySummaries(env: AppEnv, now = new Date(), force = false) {
  if (!force && now.getUTCHours() !== SUMMARY_HOUR_UTC) return { skipped: "not the hour" };
  const day = now.toISOString().slice(0, 10);
  const { results: camps } = await env.APP_DB.prepare("SELECT id, name FROM camps WHERE status IN ('open', 'closed')").all<{ id: string; name: string }>();
  const { results: staff } = await env.APP_DB.prepare(
    "SELECT phone FROM camp_staff WHERE role IN ('admin', 'coordinator') AND phone <> ''",
  ).all<{ phone: string }>();
  const phones = [...new Set((staff ?? []).map((s) => s.phone))];
  const sent: Record<string, number> = {};
  for (const camp of camps ?? []) {
    if (!phones.length) break;
    // Claim the day first: a second run the same day inserts nothing and stops.
    const claim = await env.APP_DB.prepare(
      "INSERT INTO camp_daily_summaries (camp_id, day, recipients) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
    )
      .bind(camp.id, day, phones.length)
      .run();
    if (claim.meta.changes !== 1) continue;
    const text = summaryText(camp.name, await numbers(env, camp.id, day));
    const ok = await Promise.all(phones.map((p) => sendSms(env, p, text, "Commune")));
    sent[camp.name] = ok.filter(Boolean).length;
  }
  return { day, sent };
}
