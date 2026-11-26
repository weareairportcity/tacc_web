import { communeOrigin } from "./notify";
import { logCampSms, sendSmsMany, smsParts } from "./sms";
import { HttpError, json, nowIso, readJson, UUID, type AppEnv } from "./util";

/**
 * The arrival and health reminder. Everyone who hasn't said when and how they
 * get to camp, and/or hasn't added an emergency contact and health details,
 * gets one text saying exactly what's missing, with one link to the page
 * (which asks for just those). Same words for everyone in a group, so each
 * group goes out in a few calls. Sent at a set time (camp_scheduled_sends,
 * picked up by the 10-minute cron) or to one person as a test.
 */

type Row = { id: string; phone: string; arrival: number; details: number };
export type Variant = "arrival" | "details" | "both";

/** The words for each case. {camp} is the camp's name, {link} the page. */
export const WORDS: Record<Variant, string> = {
  arrival: "Commune: please tell us which day and time you'll arrive at {camp}, and whether you're coming by bus or by yourself. It takes a minute: {link} - The Airport City Church",
  details: "Commune: please add your emergency contact and any health needs for {camp}, so we can look after you at camp. It takes a minute: {link} - The Airport City Church",
  both: "Commune: before {camp}, please tell us when and how you're getting there, and add your emergency contact and health details. It takes two minutes: {link} - The Airport City Church",
};

const fill = (v: Variant, camp: string, link: string) => WORDS[v].replace("{camp}", camp).replace("{link}", link);

async function people(env: AppEnv, campId: string, only: string | null): Promise<{ camp: { name: string; slug: string }; rows: Row[] } | null> {
  const camp = await env.APP_DB.prepare("SELECT name, slug, details_required FROM camps WHERE id = ?").bind(campId).first<{ name: string; slug: string; details_required: number }>();
  if (!camp) return null;
  const { results } = await env.APP_DB.prepare(
    `SELECT id, phone,
       CASE WHEN arrival_day = '' OR arrival_time = '' OR transport = '' THEN 1 ELSE 0 END AS arrival,
       CASE WHEN ?2 = 1 AND NOT (emergency_name <> '' AND emergency_phone <> '' AND (health_none = 1 OR health_notes <> '')) THEN 1 ELSE 0 END AS details
     FROM camp_registrations
     WHERE camp_id = ?1 AND status <> 'cancelled' AND deleted_at IS NULL ${only ? "AND id = ?3" : ""}`,
  )
    .bind(...(only ? [campId, camp.details_required, only] : [campId, camp.details_required]))
    .all<Row>();
  return { camp, rows: results ?? [] };
}

const variantOf = (r: Row): Variant | null => (r.arrival && r.details ? "both" : r.arrival ? "arrival" : r.details ? "details" : null);

/**
 * Sends (or, with dry, only counts) the reminder. `only` + `force`: one person
 * gets the given variant whatever they're missing, for a test.
 */
export async function sendArrivalReminders(env: AppEnv, campId: string, o: { only?: string | null; force?: Variant | null; dry?: boolean } = {}) {
  const found = await people(env, campId, o.only ?? null);
  if (!found) return { error: "unknown camp" };
  const link = `${communeOrigin(env)}/${found.camp.slug}/me`;
  const groups: Record<Variant, string[]> = { arrival: [], details: [], both: [] };
  let noPhone = 0;
  for (const r of found.rows) {
    const v = o.force ?? variantOf(r);
    if (!v) continue;
    if (!/^233\d{9}$/.test(r.phone)) {
      noPhone++;
      continue;
    }
    groups[v].push(r.phone);
  }
  const counts = { arrival: groups.arrival.length, details: groups.details.length, both: groups.both.length, no_phone: noPhone };
  const messages = Object.fromEntries((Object.keys(groups) as Variant[]).map((v) => [v, { text: fill(v, found.camp.name, link), parts: smsParts(fill(v, found.camp.name, link)), people: groups[v].length }]));
  if (o.dry) return { counts, messages };
  let sent = 0;
  let failed = 0;
  for (const v of Object.keys(groups) as Variant[]) {
    if (!groups[v].length) continue;
    const text = fill(v, found.camp.name, link);
    const r = await sendSmsMany(env, groups[v], text, "Commune");
    sent += r.sent;
    failed += r.failed;
    if (r.sent) await logCampSms(env, campId, "arrival_details", r.sent, r.sent * smsParts(text));
  }
  return { counts, sent, failed };
}

/** Texts whose time has come (checked every 10 minutes). Each is claimed first, so it goes once. */
export async function runScheduledSends(env: AppEnv, now = new Date()) {
  const { results } = await env.APP_DB.prepare("SELECT id, camp_id, kind FROM camp_scheduled_sends WHERE sent_at IS NULL AND send_at <= ? ORDER BY send_at LIMIT 3")
    .bind(now.toISOString())
    .all<{ id: string; camp_id: string; kind: string }>();
  const done: unknown[] = [];
  for (const job of results ?? []) {
    const claimed = await env.APP_DB.prepare("UPDATE camp_scheduled_sends SET sent_at = ? WHERE id = ? AND sent_at IS NULL RETURNING id").bind(nowIso(), job.id).first();
    if (!claimed) continue;
    const result = job.kind === "arrival_details" ? await sendArrivalReminders(env, job.camp_id) : { error: "unknown kind" };
    await env.APP_DB.prepare("UPDATE camp_scheduled_sends SET result_json = ? WHERE id = ?").bind(JSON.stringify(result), job.id).run();
    done.push({ id: job.id, ...result });
  }
  return done;
}

/**
 * Admin: `dry` shows who'd get what; `registration_id` (+ optional `variant`)
 * sends to one person as a test; `schedule_at` (ISO time) queues the real send.
 */
export async function arrivalSmsEndpoint(request: Request, env: AppEnv) {
  const b = await readJson<{ camp_id?: unknown; dry?: unknown; registration_id?: unknown; variant?: unknown; schedule_at?: unknown; cancel?: unknown }>(request);
  if (typeof b.camp_id !== "string" || !UUID.test(b.camp_id)) throw new HttpError(400, "camp_id required");
  if (typeof b.cancel === "string") {
    const r = await env.APP_DB.prepare("DELETE FROM camp_scheduled_sends WHERE id = ? AND sent_at IS NULL").bind(b.cancel).run();
    return json({ removed: r.meta.changes ?? 0 });
  }
  if (typeof b.schedule_at === "string") {
    const at = new Date(b.schedule_at);
    if (Number.isNaN(at.getTime())) throw new HttpError(400, "schedule_at must be a time");
    const id = crypto.randomUUID();
    await env.APP_DB.prepare("INSERT INTO camp_scheduled_sends (id, camp_id, kind, send_at) VALUES (?, ?, 'arrival_details', ?)").bind(id, b.camp_id, at.toISOString()).run();
    return json({ scheduled: id, send_at: at.toISOString() });
  }
  const only = typeof b.registration_id === "string" && UUID.test(b.registration_id) ? b.registration_id : null;
  const force = b.variant === "arrival" || b.variant === "details" || b.variant === "both" ? b.variant : null;
  if (b.dry !== true && !only) throw new HttpError(400, "send needs a registration_id (a test); the real send is scheduled");
  return json(await sendArrivalReminders(env, b.camp_id, { only, force: only ? force : null, dry: b.dry === true }));
}
