import { batch, query } from "@/lib/cf";
import { COMMUNE_SENDER, sendSMS } from "@/lib/mnotify";
import { smsPartsOf } from "@/lib/sms-plain";
import { APP_STATE_SQL, type AppState } from "./app-first";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { pushMany } from "./notify";
import { coordinatorText, firstName, MAX_COORDINATOR_MESSAGE } from "./sms";
import { logCampSms } from "./sms-log";
import { CampError, type Camp, type RegistrationStatus } from "./types";
import { AUDIENCES, inAudience, type Audience } from "./broadcast-audience";

export { AUDIENCES, type Audience };

/**
 * Texts: one message to everyone registered (or a part of them), each
 * greeted by first name. With "app first", people who have the app get it as
 * an app notification (free) and only the rest are texted. Counted in
 * camp_sms_log so the page shows what it cost.
 */

export type Recipient = { id: string; full_name: string; phone: string; status: RegistrationStatus; app: AppState };

/** Everyone who can get a message: registered, not cancelled, with a Ghana mobile number. */
export function listRecipients(campId: string) {
  return query<Recipient>(
    "app",
    `SELECT r.id, r.full_name, r.phone, r.status, ${APP_STATE_SQL} AS app FROM camp_registrations r
     WHERE r.camp_id = ? AND r.status <> 'cancelled' AND r.phone GLOB '233[0-9]*' AND length(r.phone) = 12
     ORDER BY r.full_name`,
    [checkId(campId, "camp")],
  );
}

const PARALLEL = 10;

export async function sendBroadcast(actor: string, camp: Camp, audience: Audience, message: string, appFirst: boolean) {
  const text = String(message ?? "").trim();
  if (text.length < 3) throw new CampError("Write the message first.");
  if (text.length > MAX_COORDINATOR_MESSAGE) throw new CampError(`Keep it to ${MAX_COORDINATOR_MESSAGE} characters.`);
  if (!AUDIENCES.includes(audience)) throw new CampError("Pick who it's for.");
  const people = (await listRecipients(camp.id)).filter((r) => inAudience(r, audience));
  if (!people.length) throw new CampError("Nobody to send it to.");

  const { delivered } = appFirst
    ? await pushMany(
        people
          .filter((p) => p.app === "on")
          .map((p) => ({
            registration_id: p.id,
            kind: "messages" as const,
            title: camp.name,
            body: `Hi ${firstName(p.full_name)}, ${text}`,
            url: `/camps/${camp.slug}/me`,
          })),
      )
    : { delivered: new Set<string>() };

  const toText = people.filter((p) => !delivered.has(p.id));
  let texts = 0;
  let credits = 0;
  for (let i = 0; i < toText.length; i += PARALLEL) {
    await Promise.all(
      toText.slice(i, i + PARALLEL).map(async (p) => {
        const sms = coordinatorText(p.full_name, text);
        if (await sendSMS(p.phone, sms, COMMUNE_SENDER).catch(() => false)) {
          texts++;
          credits += smsPartsOf(sms);
        }
      }),
    );
  }
  const failed = toText.length - texts;
  if (!texts && !delivered.size) throw new CampError("Nothing went. Please try again.");
  await logCampSms({ campId: camp.id, kind: "broadcast", texts, credits, pushed: delivered.size, actor, note: text });
  await batch("app", [
    auditStatement({ actor, campId: camp.id, action: "people.broadcast", entity: "camp", entityId: camp.id, after: { audience, texts, credits, app: delivered.size, failed } }),
  ]);
  return { texts, credits, app: delivered.size, failed };
}
