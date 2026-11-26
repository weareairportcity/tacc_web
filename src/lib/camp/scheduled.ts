import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId, getCamp } from "./camps";
import { AUDIENCES, sendBroadcast, type Audience } from "./broadcast";
import { MAX_COORDINATOR_MESSAGE } from "./sms";
import { CampError } from "./types";
import { DELIVERIES, type Delivery } from "./broadcast";
import { sendArrivalReminders } from "./arrival-reminder";

/**
 * Messages scheduled for later (Texts). A row waits in camp_scheduled_sends;
 * the Worker's 10-minute cron asks the site to send the ones that are due
 * (src/app/api/camp/scheduled). Sending uses the same code as "Send now", so
 * each person is greeted by first name and counted the same. Who is in the
 * audience is worked out when it goes, not when it's scheduled.
 */

export type Scheduled = {
  id: string;
  created_at: string;
  kind: "arrival_details" | "message";
  send_at: string;
  sent_at: string | null;
  cancelled_at: string | null;
  created_by: string;
  audience: string | null;
  how: string | null;
  message: string | null;
  result_json: string | null;
};

const MIN_AHEAD_MS = 2 * 60 * 1000;
const MAX_AHEAD_MS = 90 * 86_400_000;

export async function scheduleMessage(actor: string, campId: string, o: { audience: Audience; message: string; how: Delivery; sendAt: string }) {
  const camp = await getCamp(checkId(campId, "camp"));
  if (!camp) throw new CampError("Unknown camp.");
  if (!AUDIENCES.includes(o.audience)) throw new CampError("Pick who it's for.");
  if (!DELIVERIES.includes(o.how)) throw new CampError("Pick how to send it.");
  const message = String(o.message ?? "").trim();
  if (message.length < 3) throw new CampError("Write the message first.");
  if (message.length > MAX_COORDINATOR_MESSAGE) throw new CampError(`Keep it to ${MAX_COORDINATOR_MESSAGE} characters.`);
  const at = new Date(o.sendAt);
  if (Number.isNaN(at.getTime())) throw new CampError("Choose when to send it.");
  if (at.getTime() < Date.now() + MIN_AHEAD_MS) throw new CampError("Choose a time at least a few minutes from now.");
  if (at.getTime() > Date.now() + MAX_AHEAD_MS) throw new CampError("Choose a time within the next 90 days.");
  const id = crypto.randomUUID();
  await batch("app", [
    {
      sql: "INSERT INTO camp_scheduled_sends (id, camp_id, kind, send_at, created_by, audience, how, message) VALUES (?, ?, 'message', ?, ?, ?, ?, ?)",
      params: [id, camp.id, at.toISOString(), actor, o.audience, o.how, message],
    },
    auditStatement({ actor, campId: camp.id, action: "people.schedule", entity: "camp", entityId: camp.id, after: { audience: o.audience, how: o.how, send_at: at.toISOString(), note: message.slice(0, 120) } }),
  ]);
  return { id, send_at: at.toISOString() };
}

/** What's waiting (soonest first), then what has gone or been cancelled (latest first). */
export async function listScheduled(campId: string) {
  const rows = await query<Scheduled>(
    "app",
    `SELECT id, created_at, kind, send_at, sent_at, cancelled_at, created_by, audience, how, message, result_json
     FROM camp_scheduled_sends WHERE camp_id = ? ORDER BY send_at`,
    [checkId(campId, "camp")],
  );
  return {
    waiting: rows.filter((r) => !r.sent_at && !r.cancelled_at),
    done: rows.filter((r) => r.sent_at || r.cancelled_at).reverse().slice(0, 30),
  };
}

export async function cancelScheduled(actor: string, id: string) {
  const [row] = await query<{ camp_id: string }>("app", "SELECT camp_id FROM camp_scheduled_sends WHERE id = ?", [checkId(id, "scheduled message")]);
  if (!row) throw new CampError("Unknown scheduled message.");
  const results = await batch("app", [
    { sql: "UPDATE camp_scheduled_sends SET cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND sent_at IS NULL AND cancelled_at IS NULL RETURNING id", params: [id] },
    auditStatement({ actor, campId: row.camp_id, action: "people.schedule_cancel", entity: "scheduled", entityId: id, ifChanged: true }),
  ]);
  if (!results[0].results.length) throw new CampError("That one has already gone or been cancelled.");
}

/** Sends one that's due. Claimed first, so two callers never send it twice. Never throws: the outcome is saved on the row. */
export async function sendScheduled(id: string, origin: string) {
  const [job] = await query<Scheduled & { camp_id: string }>(
    "app",
    `UPDATE camp_scheduled_sends SET sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ? AND sent_at IS NULL AND cancelled_at IS NULL AND send_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     RETURNING id, camp_id, kind, created_by, audience, how, message`,
    [checkId(id, "scheduled message")],
  );
  if (!job) return { skipped: true as const };
  let result: Record<string, unknown>;
  try {
    const camp = await getCamp(job.camp_id);
    if (!camp) throw new CampError("Unknown camp.");
    result =
      job.kind === "arrival_details"
        ? await sendArrivalReminders(camp.id, { origin })
        : await sendBroadcast(job.created_by, camp, job.audience as Audience, job.message ?? "", job.how as Delivery);
  } catch (err) {
    result = { error: err instanceof Error ? err.message : "Nothing went." };
  }
  await query("app", "UPDATE camp_scheduled_sends SET result_json = ? WHERE id = ?", [JSON.stringify(result), id]);
  return { skipped: false as const, result };
}
