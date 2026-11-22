import { cancelled } from "./notify";
import { FULL_NAME_PROBLEM, isFullName, tidyName } from "./names";
import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId, getCamp } from "./camps";
import { generateCode, hashCode } from "./codes";
import { getGroupFor } from "./groups";
import { checkShirtSize, cancelRegistration, getRegistration, normalizePhone } from "./registrations";
import { CampError, type Camp, type PrivateDetails, type ProfileInput, type Registration } from "./types";

/**
 * What an attendee manages themselves: their details, "any room", and
 * cancelling or deleting. Callers pass the signed-in attendee's own
 * registration; nothing here trusts an id from the browser.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const actorOf = (me: Registration) => `attendee:${me.id}`;

const emptyDetails = (): PrivateDetails => ({
  emergency_name: "",
  emergency_phone: "",
  health_notes: "",
  is_minor: 0,
  guardian_name: "",
  guardian_phone: "",
  health_consent_at: null,
  health_none: 0,
});

export async function getPrivateDetails(registrationId: string): Promise<PrivateDetails> {
  const [row] = await query<PrivateDetails>(
    "app",
    `SELECT emergency_name, emergency_phone, health_notes, is_minor, guardian_name, guardian_phone, health_consent_at, health_none
     FROM camp_registrations WHERE id = ?`,
    [checkId(registrationId, "registration")],
  );
  return row ?? emptyDetails();
}

/** Emergency name + Ghana phone, and either health notes or "none". */
export function detailsComplete(d: Pick<PrivateDetails, "emergency_name" | "emergency_phone" | "health_notes" | "health_none">) {
  return Boolean(d.emergency_name.trim() && d.emergency_phone && (d.health_none || d.health_notes.trim()));
}

/** This camp asks for details, they haven't cancelled, and they haven't answered yet. */
export function mustGiveDetails(camp: Pick<Camp, "details_required">, me: Pick<Registration, "status">, details: Pick<PrivateDetails, "emergency_name" | "emergency_phone" | "health_notes" | "health_none">) {
  if (!camp.details_required || me.status === "cancelled") return false;
  return !detailsComplete(details);
}

export async function assertReadyDetails(camp: Camp, me: Registration) {
  if (!mustGiveDetails(camp, me, await getPrivateDetails(me.id))) return;
  throw new CampError("Add your emergency contact and health details first, on your home page.");
}

export type HealthRow = {
  id: string;
  full_name: string;
  fellowship: string;
  emergency_name: string;
  emergency_phone: string;
  health_notes: string;
  health_none: number;
};

/** Coordinators' Health page: who has answered, and who hasn't. Cancelled left out. */
export async function listHealth(campId: string) {
  const rows = await query<HealthRow>(
    "app",
    `SELECT id, full_name, fellowship, emergency_name, emergency_phone, health_notes, health_none
     FROM camp_registrations
     WHERE camp_id = ? AND status <> 'cancelled' AND deleted_at IS NULL
     ORDER BY full_name COLLATE NOCASE`,
    [checkId(campId, "camp")],
  );
  const added: HealthRow[] = [];
  const missing: HealthRow[] = [];
  for (const row of rows) (detailsComplete(row) ? added : missing).push(row);
  return { added, missing };
}

export function validateProfile(raw: ProfileInput, opts?: { requireDetails?: boolean }): ProfileInput {
  const problems: string[] = [];
  const full_name = tidyName(raw.full_name);
  if (!isFullName(full_name)) problems.push(FULL_NAME_PROBLEM);
  if (full_name.length > 120) problems.push("Your name is too long.");
  const email = String(raw.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) problems.push("Enter a valid email address.");
  const shirt_size = checkShirtSize(raw.shirt_size, problems);
  const emergency_name = String(raw.emergency_name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const rawPhone = String(raw.emergency_phone ?? "").trim();
  const emergency_phone = rawPhone ? normalizePhone(rawPhone) : "";
  if (emergency_phone === null) problems.push("Enter the emergency contact's phone as a Ghana number, e.g. 024 555 0101.");
  const health_notes = String(raw.health_notes ?? "").trim().slice(0, 1000);
  const health_none = health_notes ? false : raw.health_none;
  if (opts?.requireDetails) {
    if (!emergency_name) problems.push("Enter who we should call in an emergency, and how they're related to you.");
    if (!rawPhone) problems.push("Enter the emergency contact's phone as a Ghana number, e.g. 024 555 0101.");
    if (!health_notes && health_none !== true) problems.push("Tell us about your health, or tick that you have no health conditions.");
  }
  if (problems.length) throw new CampError(problems.join(" "));
  return { full_name, email, shirt_size, emergency_name, emergency_phone: emergency_phone ?? "", health_notes, health_consent: raw.health_consent === true, health_none };
}

/** The attendee's own edit, or a coordinator's (actor is then their email). */
export async function updateProfile(actor: string, registrationId: string, raw: ProfileInput) {
  const before = await getRegistration(registrationId);
  if (!before) throw new CampError("Unknown registration.");
  const self = actor === `attendee:${before.id}`;
  const camp = await getCamp(before.camp_id);
  const requireDetails = !!camp?.details_required && self;
  const input = validateProfile(raw, { requireDetails });
  const prev = await getPrivateDetails(before.id);
  const health_none = input.health_notes ? 0 : input.health_none === true ? 1 : input.health_none === false ? 0 : prev.health_none;
  // Health notes are special personal data (Act 843): an attendee writing them ticks that they
  // agree. A coordinator noting what they were told is the church's own record. Removing the
  // notes takes the agreement back.
  if (self && input.health_notes) {
    if (!prev.health_consent_at && !input.health_consent) throw new CampError("Tick that you agree to us keeping your health notes, or leave them empty.");
  }
  const consent = !input.health_notes ? "NULL" : self ? "coalesce(health_consent_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))" : "health_consent_at";
  await batch("app", [
    {
      sql: `UPDATE camp_registrations SET full_name = ?, email = ?, shirt_size = ?, emergency_name = ?, emergency_phone = ?, health_notes = ?,
              health_none = ?, health_consent_at = ${consent}
            WHERE id = ? AND deleted_at IS NULL`,
      params: [input.full_name, input.email, input.shirt_size, input.emergency_name, input.emergency_phone, input.health_notes, health_none, before.id],
    },
    // No values in the log: it holds no contact or health details.
    auditStatement({ actor, campId: before.camp_id, action: "registration.profile", entity: "registration", entityId: before.id, ifChanged: true }),
  ]);
}

/** "I'm happy with any room". Only before they've joined a group. */
export async function setAnyRoom(me: Registration, anyRoom: boolean) {
  if (anyRoom && (await getGroupFor(me.id))) throw new CampError("Leave your roommate group first.");
  await batch("app", [
    { sql: "UPDATE camp_registrations SET any_room = ? WHERE id = ?", params: [anyRoom ? 1 : 0, me.id] },
    auditStatement({ actor: actorOf(me), campId: me.camp_id, action: anyRoom ? "registration.any_room" : "registration.choose_room", entity: "registration", entityId: me.id }),
  ]);
}

/** A refund request, written in the same batch as the cancel. */
export function refundRequestStatement(registration: Registration, amount: number, reason: string, requestedBy: string) {
  return {
    sql: `INSERT INTO camp_requests (id, camp_id, registration_id, kind, amount_pesewas, reason, requested_by)
          SELECT ?, ?, ?, 'refund', ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM camp_requests WHERE registration_id = ? AND kind = 'refund' AND status = 'pending')`,
    params: [crypto.randomUUID(), registration.camp_id, registration.id, amount, reason.slice(0, 500), requestedBy, registration.id],
  };
}

/**
 * Cancels the attendee's own registration. If they've paid, a refund request
 * for all of it goes to the coordinators (refunds are case by case).
 * `deleteDetails` also wipes their personal details (see deleteDetails).
 */
export async function cancelMine(me: Registration, reason: string, deleteDetails: boolean) {
  if (me.status === "cancelled") throw new CampError("Your registration is already cancelled.");
  const extra: { sql: string; params: unknown[] }[] = me.paid_pesewas > 0 ? [refundRequestStatement(me, me.paid_pesewas, String(reason ?? "").trim(), actorOf(me))] : [];
  if (deleteDetails) extra.push(...wipeStatements(me, reason));
  await cancelRegistration(actorOf(me), me.id, extra);
  await cancelled(me, String(reason ?? ""), deleteDetails);
  return { refundRequested: me.paid_pesewas > 0 };
}

/** Deleting details after an earlier cancel. */
export async function deleteMyDetails(me: Registration, reason = "") {
  if (me.status !== "cancelled") return cancelMine(me, reason, true);
  await batch("app", wipeStatements(me, reason));
  return { refundRequested: false };
}

/**
 * Removes name, phone, email and notes. The row stays so payments, refunds and
 * the audit log still add up; the code is replaced, so it can't be signed into.
 */
function wipeStatements(me: Registration, reason = "") {
  return [
    {
      sql: `UPDATE camp_registrations SET full_name = 'Deleted', phone = ?, email = '', emergency_name = '', emergency_phone = '',
              health_notes = '', health_none = 0, health_consent_at = NULL, guardian_name = '', guardian_phone = '', shirt_size = '', code_hash = ?, deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
              app_installed_at = NULL, app_platform = NULL, texts_only_at = NULL
            WHERE id = ?`,
      params: [`deleted:${me.id}`, hashCode(generateCode(16)), me.id],
    },
    // Their phones' notification addresses and choices, and what they wrote when rating Commune (the stars stay, as a count).
    { sql: "DELETE FROM camp_push_subs WHERE owner = ?", params: [`attendee:${me.id}`] },
    { sql: "DELETE FROM camp_notify_prefs WHERE owner = ?", params: [`attendee:${me.id}`] },
    { sql: "UPDATE camp_pay_experience SET comment = '' WHERE registration_id = ?", params: [me.id] },
    auditStatement({ actor: actorOf(me), campId: me.camp_id, action: "registration.delete_details", entity: "registration", entityId: me.id, after: reason ? { reason: reason.slice(0, 300) } : undefined }),
  ];
}

/** "What's your full name?": for people who registered with one name, before full names were required. */
export async function setFullName(me: Registration, raw: string) {
  const full_name = tidyName(raw);
  if (!isFullName(full_name)) throw new CampError(FULL_NAME_PROBLEM);
  if (full_name.length > 120) throw new CampError("Your name is too long.");
  await batch("app", [
    { sql: "UPDATE camp_registrations SET full_name = ? WHERE id = ? AND deleted_at IS NULL", params: [full_name, me.id] },
    auditStatement({ actor: actorOf(me), campId: me.camp_id, action: "registration.profile", entity: "registration", entityId: me.id }),
  ]);
}
