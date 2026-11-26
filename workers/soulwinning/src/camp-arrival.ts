import { communeOrigin } from "./notify";
import { HttpError, json, nowIso, readJson, UUID, type AppEnv } from "./util";

/**
 * Texts scheduled for a set time (camp_scheduled_sends): a coordinator's
 * message, or the arrival and health reminder. They're sent by the site, which
 * greets each person by first name and counts the cost (this Worker can't
 * make a few hundred calls in one run). The Worker only watches the clock.
 */

/**
 * Everything whose time has come (checked every 10 minutes; cancelled ones are
 * skipped). The site claims each one before sending, so asking twice is safe,
 * and one it couldn't reach is simply asked again next time.
 */
export async function runScheduledSends(env: AppEnv, now = new Date()) {
  const { results } = await env.APP_DB.prepare("SELECT id FROM camp_scheduled_sends WHERE sent_at IS NULL AND cancelled_at IS NULL AND send_at <= ? ORDER BY send_at LIMIT 3")
    .bind(now.toISOString())
    .all<{ id: string }>();
  const done: unknown[] = [];
  for (const job of results ?? []) {
    try {
      const res = await fetch(`${communeOrigin(env)}/api/camp/scheduled`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.ADMIN_SECRET}` },
        body: JSON.stringify({ id: job.id }),
      });
      done.push({ id: job.id, status: res.status });
    } catch (err) {
      console.error("scheduled send", job.id, err);
      done.push({ id: job.id, error: "site not reachable; will try again" });
    }
  }
  return done;
}

/** Admin: `schedule_at` (an ISO time) queues the arrival reminder; `cancel` (an id) stops a waiting one. */
export async function arrivalSmsEndpoint(request: Request, env: AppEnv) {
  const b = await readJson<{ camp_id?: unknown; schedule_at?: unknown; cancel?: unknown }>(request);
  if (typeof b.cancel === "string") {
    const r = await env.APP_DB.prepare("UPDATE camp_scheduled_sends SET cancelled_at = ? WHERE id = ? AND sent_at IS NULL AND cancelled_at IS NULL").bind(nowIso(), b.cancel).run();
    return json({ cancelled: r.meta.changes ?? 0 });
  }
  if (typeof b.camp_id !== "string" || !UUID.test(b.camp_id) || typeof b.schedule_at !== "string") throw new HttpError(400, "camp_id and schedule_at required");
  const at = new Date(b.schedule_at);
  if (Number.isNaN(at.getTime())) throw new HttpError(400, "schedule_at must be a time");
  const id = crypto.randomUUID();
  await env.APP_DB.prepare("INSERT INTO camp_scheduled_sends (id, camp_id, kind, send_at, created_by) VALUES (?, ?, 'arrival_details', ?, 'system')").bind(id, b.camp_id, at.toISOString()).run();
  return json({ scheduled: id, send_at: at.toISOString() });
}
