import { query } from "@/lib/cf";
import { COMMUNE_SENDER, sendSMS } from "@/lib/mnotify";
import { smsPartsOf } from "@/lib/sms-plain";
import { APP_STATE_SQL } from "./app-first";
import { checkId, getCamp } from "./camps";
import { pushMany } from "./notify";
import { coordinatorText, firstName } from "./sms";
import { logCampSms } from "./sms-log";
import { CampError } from "./types";

/**
 * The arrival and health reminder. Each person who hasn't said when and how
 * they get to camp, and/or hasn't added an emergency contact and health
 * details, gets a text greeting them by first name and saying exactly what's
 * missing, with one link to their page (which asks for just those). Worked
 * out when it goes, so people who filled things in meanwhile aren't texted.
 */

export type Variant = "arrival" | "details" | "both";

/** What follows "Hi Ama, ". {camp} is the camp's name, {link} their page. */
export const WORDS: Record<Variant, string> = {
  arrival: "please tell us which day and time you'll arrive at {camp}, and whether you're coming by bus or by yourself. It takes a minute: {link}",
  details: "please add your emergency contact and any health needs for {camp}, so we can look after you at camp. It takes a minute: {link}",
  both: "before {camp}, please tell us when and how you're getting there, and add your emergency contact and health details. It takes two minutes: {link}",
};

type Row = { id: string; full_name: string; phone: string; arrival: number; details: number; app: string };

const variantOf = (r: Pick<Row, "arrival" | "details">): Variant | null => (r.arrival && r.details ? "both" : r.arrival ? "arrival" : r.details ? "details" : null);
const PARALLEL = 10;

export async function sendArrivalReminders(campId: string, o: { only?: string | null; force?: Variant | null; dry?: boolean; origin: string }) {
  const camp = await getCamp(checkId(campId, "camp"));
  if (!camp) throw new CampError("Unknown camp.");
  const link = `${o.origin.replace(/\/+$/, "")}/${camp.slug}/me`;
  const rows = await query<Row>(
    "app",
    `SELECT r.id, r.full_name, r.phone, ${APP_STATE_SQL} AS app,
       CASE WHEN r.arrival_day = '' OR r.arrival_time = '' OR r.transport = '' THEN 1 ELSE 0 END AS arrival,
       CASE WHEN ?2 = 1 AND NOT (r.emergency_name <> '' AND r.emergency_phone <> '' AND (r.health_none = 1 OR r.health_notes <> '')) THEN 1 ELSE 0 END AS details
     FROM camp_registrations r
     WHERE r.camp_id = ?1 AND r.status <> 'cancelled' AND r.deleted_at IS NULL ${o.only ? "AND r.id = ?3" : ""}
     ORDER BY r.full_name COLLATE NOCASE`,
    o.only ? [camp.id, camp.details_required, o.only] : [camp.id, camp.details_required],
  );
  const text = (v: Variant, full_name: string) => coordinatorText(full_name, WORDS[v].replace("{camp}", camp.name).replace("{link}", link));
  const jobs: { id: string; phone: string; full_name: string; v: Variant; app: boolean }[] = [];
  const counts = { arrival: 0, details: 0, both: 0, no_phone: 0 };
  for (const r of rows) {
    const v = o.force ?? variantOf(r);
    if (!v) continue;
    if (!/^233\d{9}$/.test(r.phone)) {
      counts.no_phone++;
      continue;
    }
    counts[v]++;
    jobs.push({ id: r.id, phone: r.phone, full_name: r.full_name, v, app: r.app === "on" });
  }
  const sample = Object.fromEntries((Object.keys(WORDS) as Variant[]).map((v) => [v, text(v, "Ama Mensah")]));
  if (o.dry) return { counts, sample };
  // People with the app also get it as an app notification, free: tapping it opens the installed
  // app (a link in a text opens the browser; phones don't hand text links to a Home Screen app).
  const { delivered } = await pushMany(
    jobs.filter((j) => j.app).map((j) => ({ registration_id: j.id, kind: "messages" as const, title: camp.name, body: `Hi ${firstName(j.full_name)}, ${WORDS[j.v].replace("{camp}", camp.name).split(" It takes")[0]}. Tap to open Commune.`,
        url: `/camps/${camp.slug}/me` })),
  );
  let sent = 0;
  let credits = 0;
  for (let i = 0; i < jobs.length; i += PARALLEL) {
    await Promise.all(
      jobs.slice(i, i + PARALLEL).map(async (j) => {
        const sms = text(j.v, j.full_name);
        if (await sendSMS(j.phone, sms, COMMUNE_SENDER).catch(() => false)) {
          sent++;
          credits += smsPartsOf(sms);
        }
      }),
    );
  }
  await logCampSms({ campId: camp.id, kind: "arrival_details", texts: sent, credits, actor: "system", note: "Arrival and health reminder" });
  return { counts, sent, failed: jobs.length - sent, credits, app: delivered.size };
}
