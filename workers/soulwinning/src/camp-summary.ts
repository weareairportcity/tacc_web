import { sendSms } from "./sms";
import { card, tellGroups, telegramConfigured } from "./telegram";
import type { AppEnv } from "./util";

/**
 * Where a camp stands.
 *
 *   Evening text: one SMS per camp per day at 7 pm Ghana time (UTC), to every
 *   admin and coordinator with a phone saved on Settings. camp_daily_summaries
 *   records the send, so the hourly cron never sends twice.
 *   Telegram: the same day's summary, laid out in sections, at 7 pm, and at
 *   any time with /summary.
 */

export const SUMMARY_HOUR_UTC = 19;
/** A room type at or under this many places left is called out. */
const LOW_PLACES = 5;

const cedis = (pesewas: number) => `GHS ${Math.round(pesewas / 100).toLocaleString("en-GH")}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Low = { name: string; gender: string; places_left: number };
type Numbers = {
  registeredToday: number;
  moneyToday: number;
  flagged: number;
  requests: number;
  low: Low[];
  people: { total: number; full: number; part: number; none: number; cancelled: number };
  received: number;
  owed: number;
  placed: number;
};

async function numbers(env: AppEnv, campId: string, day: string): Promise<Numbers> {
  const db = env.APP_DB;
  const [reg, money, flagged, requests, low, people, received, placed] = await Promise.all([
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
    ).bind(campId, LOW_PLACES).all<Low>(),
    db.prepare(
      `SELECT COALESCE(SUM(status <> 'cancelled'), 0) AS total, COALESCE(SUM(status = 'fully_paid'), 0) AS full,
              COALESCE(SUM(status = 'partially_paid'), 0) AS part, COALESCE(SUM(status = 'registered'), 0) AS none,
              COALESCE(SUM(status = 'cancelled'), 0) AS cancelled,
              COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN MAX(price_pesewas - paid_pesewas, 0) ELSE 0 END), 0) AS owed
       FROM camp_registrations WHERE camp_id = ?`,
    ).bind(campId).first<Numbers["people"] & { owed: number }>(),
    db.prepare("SELECT COALESCE(SUM(paid_pesewas), 0) AS n FROM camp_registrations WHERE camp_id = ?").bind(campId).first<{ n: number }>(),
    db.prepare(
      `SELECT COUNT(*) AS n FROM camp_room_assignments a JOIN camp_registrations r ON r.id = a.registration_id
       WHERE r.camp_id = ? AND r.status <> 'cancelled'`,
    ).bind(campId).first<{ n: number }>(),
  ]);
  const p = people ?? { total: 0, full: 0, part: 0, none: 0, cancelled: 0, owed: 0 };
  return {
    registeredToday: reg?.n ?? 0,
    moneyToday: money?.n ?? 0,
    flagged: flagged?.n ?? 0,
    requests: requests?.n ?? 0,
    low: low.results ?? [],
    people: { total: p.total, full: p.full, part: p.part, none: p.none, cancelled: p.cancelled },
    received: received?.n ?? 0,
    owed: p.owed,
    placed: placed?.n ?? 0,
  };
}

const lowWords = (low: Low[]) => low.map((l) => `${l.name} (${l.gender === "male" ? "men" : "women"}): ${l.places_left === 0 ? "full" : `${l.places_left} left`}`);

/** The evening text, in plain sentences. */
export function summaryText(campName: string, n: Numbers) {
  const today = `${plural(n.registeredToday, "new registration")} and ${cedis(n.moneyToday)} received`;
  const waiting = [n.requests && plural(n.requests, "request"), n.flagged && plural(n.flagged, "payment to check", "payments to check")].filter(Boolean);
  return [
    `Good evening! Today at ${campName}: ${today}.`,
    `In total, ${n.people.full} of ${n.people.total} people are fully paid.`,
    n.low.length ? `Running low: ${lowWords(n.low).join("; ")}.` : "",
    waiting.length ? `Waiting for you in Commune: ${waiting.join(" and ")}.` : "",
    "- The Airport City Church",
  ]
    .filter(Boolean)
    .join(" ");
}

const stamp = (now: Date) =>
  now.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" });

/** The Telegram summary: sections a coordinator can scan in seconds. */
export function summaryCard(campName: string, n: Numbers, now: Date, evening = false) {
  return card(
    evening ? "🌙" : "📊",
    `${campName}${evening ? ": today's summary" : ""}`,
    [
      "People",
      ["Registered", `${n.people.total}${n.registeredToday ? ` (${n.registeredToday} today)` : ""}`],
      ["Fully paid", String(n.people.full)],
      ["Part paid", String(n.people.part)],
      ["Not paid yet", String(n.people.none)],
      n.people.cancelled > 0 && ["Cancelled", String(n.people.cancelled)],
      "Money",
      ["Received", `${cedis(n.received)}${n.moneyToday ? ` (${cedis(n.moneyToday)} today)` : ""}`],
      ["Still owed", cedis(n.owed)],
      "Rooms",
      ["Placed in a room", `${n.placed} of ${n.people.full} fully paid`],
      ["Running low", n.low.length ? lowWords(n.low).join("; ") : "Nothing"],
      "Needs you",
      ["Requests waiting", String(n.requests)],
      ["Payments to check", String(n.flagged)],
    ],
    `As of ${stamp(now)}`,
  );
}

/** /summary in Telegram: one card per open camp. */
export async function summaries(env: AppEnv, now = new Date()) {
  const { results: camps } = await env.APP_DB.prepare("SELECT id, name FROM camps WHERE status IN ('open', 'closed') ORDER BY starts_on").all<{ id: string; name: string }>();
  const day = now.toISOString().slice(0, 10);
  return Promise.all((camps ?? []).map(async (c) => summaryCard(c.name, await numbers(env, c.id, day), now)));
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
  // The Telegram group gets it too (when its "Evening summary" switch is on).
  const groups = telegramConfigured(env) ? ((await env.APP_DB.prepare("SELECT COUNT(*) AS n FROM camp_telegram_chats").first<{ n: number }>())?.n ?? 0) : 0;
  for (const camp of camps ?? []) {
    if (!phones.length && !groups) break;
    // Claim the day first: a second run the same day inserts nothing and stops.
    const claim = await env.APP_DB.prepare(
      "INSERT INTO camp_daily_summaries (camp_id, day, recipients) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
    )
      .bind(camp.id, day, phones.length)
      .run();
    if (claim.meta.changes !== 1) continue;
    const n = await numbers(env, camp.id, day);
    const ok = await Promise.all(phones.map((p) => sendSms(env, p, summaryText(camp.name, n), "Commune")));
    sent[camp.name] = ok.filter(Boolean).length;
    if (groups) await tellGroups(env, "daily", summaryCard(camp.name, n, now, true));
  }
  return { day, sent };
}
