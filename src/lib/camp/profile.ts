import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { generateCode, hashCode } from "./codes";
import { getGroupFor } from "./groups";
import { checkShirtSize, cancelRegistration, getRegistration, normalizePhone } from "./registrations";
import { CampError, type PrivateDetails, type ProfileInput, type Registration } from "./types";

/**
 * What an attendee manages themselves: their details, "any room", and
 * cancelling or deleting. Callers pass the signed-in attendee's own
 * registration; nothing here trusts an id from the browser.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const actorOf = (me: Registration) => `attendee:${me.id}`;

export async function getPrivateDetails(registrationId: string): Promise<PrivateDetails> {
  const [row] = await query<PrivateDetails>(
    "app",
    "SELECT emergency_name, emergency_phone, health_notes FROM camp_registrations WHERE id = ?",
    [checkId(registrationId, "registration")],
  );
  return row ?? { emergency_name: "", emergency_phone: "", health_notes: "" };
}

export function validateProfile(raw: ProfileInput): ProfileInput {
  const problems: string[] = [];
  const full_name = String(raw.full_name ?? "").replace(/\s+/g, " ").trim();
  if (full_name.length < 2) problems.push("Enter your full name.");
  if (full_name.length > 120) problems.push("Your name is too long.");
  const email = String(raw.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) problems.push("Enter a valid email address.");
  const shirt_size = checkShirtSize(raw.shirt_size, problems);
  const emergency_name = String(raw.emergency_name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const rawPhone = String(raw.emergency_phone ?? "").trim();
  const emergency_phone = rawPhone ? normalizePhone(rawPhone) : "";
  if (emergency_phone === null) problems.push("Enter the emergency contact's phone as a Ghana number, e.g. 024 555 0101.");
  const health_notes = String(raw.health_notes ?? "").trim().slice(0, 1000);
  if (problems.length) throw new CampError(problems.join(" "));
  return { full_name, email, shirt_size, emergency_name, emergency_phone: emergency_phone ?? "", health_notes };
}

/** The attendee's own edit, or a coordinator's (actor is then their email). */
export async function updateProfile(actor: string, registrationId: string, raw: ProfileInput) {
  const before = await getRegistration(registrationId);
  if (!before) throw new CampError("Unknown registration.");
  const input = validateProfile(raw);
  await batch("app", [
    {
      sql: `UPDATE camp_registrations SET full_name = ?, email = ?, shirt_size = ?, emergency_name = ?, emergency_phone = ?, health_notes = ?
            WHERE id = ? AND deleted_at IS NULL`,
      params: [input.full_name, input.email, input.shirt_size, input.emergency_name, input.emergency_phone, input.health_notes, before.id],
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
  if (deleteDetails) extra.push(...wipeStatements(me));
  await cancelRegistration(actorOf(me), me.id, extra);
  return { refundRequested: me.paid_pesewas > 0 };
}

/** Deleting details after an earlier cancel. */
export async function deleteMyDetails(me: Registration) {
  if (me.status !== "cancelled") return cancelMine(me, "", true);
  await batch("app", wipeStatements(me));
  return { refundRequested: false };
}

/**
 * Removes name, phone, email and notes. The row stays so payments, refunds and
 * the audit log still add up; the code is replaced, so it can't be signed into.
 */
function wipeStatements(me: Registration) {
  return [
    {
      sql: `UPDATE camp_registrations SET full_name = 'Deleted', phone = ?, email = '', emergency_name = '', emergency_phone = '',
              health_notes = '', shirt_size = '', code_hash = ?, deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?`,
      params: [`deleted:${me.id}`, hashCode(generateCode(16)), me.id],
    },
    auditStatement({ actor: actorOf(me), campId: me.camp_id, action: "registration.delete_details", entity: "registration", entityId: me.id }),
  ];
}
