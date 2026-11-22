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
import type { Delivery } from "./message-cost";

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

/**
 * How a message goes. app: a notification to people with the app, a text to
 * the rest (and to anyone the notification didn't reach). both: important,
 * so everyone is texted and people with the app get the notification too.
 * text: everyone by text.
 */
export const DELIVERIES: readonly Delivery[] = ["app", "both", "text"];
export type { Delivery };

function checkMessage(message: string) {
  const text = String(message ?? "").trim();
  if (text.length < 3) throw new CampError("Write the message first.");
  if (text.length > MAX_COORDINATOR_MESSAGE) throw new CampError(`Keep it to ${MAX_COORDINATOR_MESSAGE} characters.`);
  return text;
}

/** Sends one coordinator message to these people, each greeted by first name, and counts what it cost. */
async function deliver(actor: string, camp: Camp, people: Recipient[], text: string, how: Delivery, kind: "broadcast" | "message", audit: Record<string, unknown>) {
  if (!DELIVERIES.includes(how)) throw new CampError("Pick how to send it.");
  if (!people.length) throw new CampError("Nobody to send it to.");
  const { delivered } =
    how === "text"
      ? { delivered: new Set<string>() }
      : await pushMany(
          people
            .filter((p) => p.app === "on")
            .map((p) => ({
              registration_id: p.id,
              kind: "messages" as const,
              title: camp.name,
              body: `Hi ${firstName(p.full_name)}, ${text}`,
              url: `/camps/${camp.slug}/me`,
            })),
        );

  const toText = how === "app" ? people.filter((p) => !delivered.has(p.id)) : people;
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
  await logCampSms({ campId: camp.id, kind, texts, credits, pushed: delivered.size, actor, note: text });
  await batch("app", [
    auditStatement({ actor, campId: camp.id, action: kind === "broadcast" ? "people.broadcast" : "people.text", entity: "camp", entityId: camp.id, after: { ...audit, how, texts, credits, app: delivered.size, failed } }),
  ]);
  return { texts, credits, app: delivered.size, failed };
}

/** Texts tab: everyone registered, or part of them. */
export async function sendBroadcast(actor: string, camp: Camp, audience: Audience, message: string, how: Delivery) {
  const text = checkMessage(message);
  if (!AUDIENCES.includes(audience)) throw new CampError("Pick who it's for.");
  const people = (await listRecipients(camp.id)).filter((r) => inAudience(r, audience));
  return deliver(actor, camp, people, text, how, "broadcast", { audience });
}

/** People and the person panel: the people picked, by id. */
export async function sendToPeople(actor: string, camp: Camp, registrationIds: string[], message: string, how: Delivery) {
  const text = checkMessage(message);
  const wanted = new Set((Array.isArray(registrationIds) ? registrationIds : []).map(String).slice(0, 500));
  const people = (await listRecipients(camp.id)).filter((r) => wanted.has(r.id));
  if (!people.length) throw new CampError("None of them can be messaged.");
  return deliver(actor, camp, people, text, how, "message", { count: people.length });
}

/**
 * A fellowship, PFCC or group leader's message to one of their people: app
 * notification only, never a text. If they haven't turned notifications on,
 * nothing is sent.
 */
export async function sendLeaderToPerson(actor: string, camp: Camp, person: { id: string; full_name: string; app: AppState; status: RegistrationStatus }, message: string) {
  const text = checkMessage(message);
  if (person.status === "cancelled") throw new CampError("That registration is cancelled.");
  const first = firstName(person.full_name);
  if (person.app !== "on") {
    throw new CampError(`${first} hasn't turned on notifications. You can only message them in the app.`);
  }
  const { delivered } = await pushMany([
    {
      registration_id: person.id,
      kind: "messages",
      title: camp.name,
      body: `Hi ${first}, ${text}`,
      url: `/camps/${camp.slug}/me/notifications`,
    },
  ]);
  if (!delivered.has(person.id)) throw new CampError(`Couldn't send it to ${first}'s phone. Try again in a moment.`);
  await batch("app", [
    auditStatement({ actor, campId: camp.id, action: "people.text", entity: "registration", entityId: person.id, after: { how: "app", leader: true, app: 1 } }),
  ]);
  return { texts: 0, credits: 0, app: 1, failed: 0 };
}

export type AppDetails = { state: AppState; platform: string; installed_at: string | null; texts_only_at: string | null; push_since: string | null };

/** One person's app status, for their panel. */
export async function appDetails(registrationId: string): Promise<AppDetails> {
  const [row] = await query<AppDetails>(
    "app",
    `SELECT ${APP_STATE_SQL} AS state, COALESCE(r.app_platform, '') AS platform, r.app_installed_at AS installed_at, r.texts_only_at,
       (SELECT MIN(s.created_at) FROM camp_push_subs s WHERE s.owner = 'attendee:' || r.id) AS push_since
     FROM camp_registrations r WHERE r.id = ?`,
    [checkId(registrationId, "registration")],
  );
  return row ?? { state: "none", platform: "", installed_at: null, texts_only_at: null, push_since: null };
}

export type AppPerson = AppDetails & { id: string; full_name: string; fellowship: string; status: RegistrationStatus };

/** The App page: everyone not cancelled, with how they get updates. */
export function listAppPeople(campId: string) {
  return query<AppPerson>(
    "app",
    `SELECT r.id, r.full_name, r.fellowship, r.status, ${APP_STATE_SQL} AS state, COALESCE(r.app_platform, '') AS platform,
       r.app_installed_at AS installed_at, r.texts_only_at,
       (SELECT MIN(s.created_at) FROM camp_push_subs s WHERE s.owner = 'attendee:' || r.id) AS push_since
     FROM camp_registrations r WHERE r.camp_id = ? AND r.status <> 'cancelled' ORDER BY r.full_name COLLATE NOCASE`,
    [checkId(campId, "camp")],
  );
}
