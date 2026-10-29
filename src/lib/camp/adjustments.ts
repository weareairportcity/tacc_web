import { batch, query } from "@/lib/cf";
import { roomStatementsForRemoval } from "./assignments";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { getGroupFor, groupStatementsForRemoval } from "./groups";
import { formatCedis } from "./money";
import { getRegistration, isFull } from "./registrations";
import { listRoomTypes, placesFor } from "./rooms";
import { CampError, type Gender, type Registration, type RoomType } from "./types";

/**
 * Coordinator corrections the spec leaves manual: recording a refund made in
 * Paystack, and moving someone to another room type. Both are audited and
 * keep payments untouched. Callers must have checked the coordinator role.
 */

/**
 * Same rule as the Worker's refreshRegistration (workers/soulwinning/src/camp.ts):
 * paid is successful payments minus refunds, and status follows from it.
 */
const NET_PAID = `((SELECT COALESCE(SUM(amount_pesewas), 0) FROM camp_payments
     WHERE registration_id = camp_registrations.id AND status = 'success')
   - (SELECT COALESCE(SUM(amount_pesewas), 0) FROM camp_refunds WHERE registration_id = camp_registrations.id))`;
const refreshStatement = (registrationId: string) => ({
  sql: `UPDATE camp_registrations SET
          paid_pesewas = ${NET_PAID},
          status = CASE
            WHEN status = 'cancelled' THEN 'cancelled'
            WHEN ${NET_PAID} >= price_pesewas THEN 'fully_paid'
            WHEN ${NET_PAID} > 0 THEN 'partially_paid'
            ELSE 'registered'
          END,
          last_paid_at = (SELECT p.paid_at FROM camp_payments p WHERE p.registration_id = camp_registrations.id AND p.status = 'success' ORDER BY p.paid_at DESC LIMIT 1),
          last_paid_pesewas = (SELECT p.amount_pesewas FROM camp_payments p WHERE p.registration_id = camp_registrations.id AND p.status = 'success' ORDER BY p.paid_at DESC LIMIT 1),
          flagged_payments = (SELECT COUNT(*) FROM camp_payments p WHERE p.registration_id = camp_registrations.id AND p.flag IN ('amount_mismatch', 'over_balance'))
        WHERE id = ?`,
  params: [registrationId],
});

async function placement(registrationId: string) {
  const [row] = await query<{ group_code: string | null; room_label: string | null }>(
    "app",
    `SELECT (SELECT g.code FROM camp_group_members m JOIN camp_groups g ON g.id = m.group_id WHERE m.registration_id = ?1) AS group_code,
            (SELECT x.label FROM camp_room_assignments a JOIN camp_rooms x ON x.id = a.room_id WHERE a.registration_id = ?1) AS room_label`,
    [registrationId],
  );
  return row;
}

// ─── Refunds ─────────────────────────────────────────────────────────────────

export type Refund = {
  id: string;
  created_at: string;
  amount_pesewas: number;
  reference: string;
  note: string;
  recorded_by: string;
};

export type RefundInput = { amount_pesewas: number; reference: string; note: string };

export function listRefunds(registrationId: string): Promise<Refund[]> {
  return query<Refund>(
    "app",
    "SELECT id, created_at, amount_pesewas, reference, note, recorded_by FROM camp_refunds WHERE registration_id = ? ORDER BY created_at",
    [checkId(registrationId, "registration")],
  );
}

/**
 * Records money already sent back in Paystack. Lowers what the person has
 * paid; unless they're cancelled, their status follows (a Fully Paid person
 * refunded in part becomes Partially Paid). Returns a warning if they're no
 * longer fully paid but still hold a group place or a bed.
 */
export async function recordRefund(actor: string, registrationId: string, raw: RefundInput) {
  const before = await getRegistration(registrationId);
  if (!before) throw new CampError("Unknown registration.");
  const input = {
    amount_pesewas: raw.amount_pesewas,
    reference: String(raw.reference ?? "").trim().slice(0, 100),
    note: String(raw.note ?? "").trim().slice(0, 500),
  };
  if (!Number.isInteger(input.amount_pesewas) || input.amount_pesewas <= 0) throw new CampError("Enter the amount refunded.");
  if (input.amount_pesewas > before.paid_pesewas) {
    throw new CampError(`${before.full_name} has paid ${formatCedis(before.paid_pesewas)}, so the refund can't be more than that.`);
  }

  const id = crypto.randomUUID();
  const results = await batch("app", [
    {
      // Guarded on what's actually been paid, so two coordinators can't refund the same money twice.
      sql: `INSERT INTO camp_refunds (id, registration_id, amount_pesewas, reference, note, recorded_by)
            SELECT ?, r.id, ?, ?, ?, ? FROM camp_registrations r WHERE r.id = ? AND ? <= ${NET_PAID.replaceAll("camp_registrations.id", "r.id")}
            RETURNING id`,
      params: [id, input.amount_pesewas, input.reference, input.note, actor, before.id, input.amount_pesewas],
    },
    auditStatement({
      actor,
      campId: before.camp_id,
      action: "registration.refund",
      entity: "registration",
      entityId: before.id,
      before: { paid_pesewas: before.paid_pesewas, status: before.status },
      after: { refund_id: id, ...input },
      ifChanged: true,
    }),
    refreshStatement(before.id),
  ]);
  if (!results[0].results.length) throw new CampError("The amount paid changed. Please refresh and try again.");

  const after = (await getRegistration(before.id))!;
  if (before.status === "fully_paid" && after.status !== "fully_paid") {
    const { group_code, room_label } = await placement(before.id);
    const holds = [group_code && "a roommate group", room_label && `room ${room_label}`].filter(Boolean);
    if (holds.length) {
      return {
        warning: `${before.full_name} is no longer fully paid but still has ${holds.join(" and ")}. Remove them if they shouldn't keep it.`,
      };
    }
  }
  return { warning: null };
}

// ─── Room type changes ───────────────────────────────────────────────────────

/**
 * Moves someone to another room type: the new price applies and their status
 * follows. Their group and bed belong to the old room type, so they leave
 * both. Blocked if they've paid more than the new price: record a refund of
 * the difference first.
 */
/** Runs a batch; if it failed because the room type just filled, says that instead. */
async function batchOrFull(type: RoomType, gender: Gender, statements: Parameters<typeof batch>[1]) {
  try {
    return await batch("app", statements);
  } catch (err) {
    if (await isFull(type.id, gender)) throw new CampError(`${type.name} just filled up for ${gender === "male" ? "men" : "women"}.`);
    throw err;
  }
}

export async function changeRoomType(actor: string, registrationId: string, roomTypeId: string) {
  const before = await getRegistration(registrationId);
  if (!before) throw new CampError("Unknown registration.");
  if (before.status === "cancelled") throw new CampError("This registration is cancelled.");
  const type = (await listRoomTypes(before.camp_id)).find((t) => t.id === checkId(roomTypeId, "room type"));
  if (!type) throw new CampError("Choose a room type from this camp.");
  if (type.id === before.room_type_id) throw new CampError(`${before.full_name} is already in ${type.name}.`);
  if (placesFor(type, before.gender) === 0) {
    throw new CampError(`${type.name} is full for ${before.gender === "male" ? "men" : "women"}. Raise its places left on Rooms first if the venue has more.`);
  }
  if (before.paid_pesewas > type.price_pesewas) {
    throw new CampError(
      `${before.full_name} has paid ${formatCedis(before.paid_pesewas)}, more than ${type.name}'s price of ${formatCedis(type.price_pesewas)}. ` +
        `Refund ${formatCedis(before.paid_pesewas - type.price_pesewas)} in Paystack and record it first.`,
    );
  }

  const reason = `room type changed to ${type.name}`;
  const moved = { ...before, room_type_id: type.id } as Registration;
  const [group, { room_label }] = await Promise.all([getGroupFor(before.id), placement(before.id)]);
  const groupRemoval = await groupStatementsForRemoval(actor, moved, reason);
  const results = await batchOrFull(type, before.gender, [
    {
      sql: `UPDATE camp_registrations SET room_type_id = ?, price_pesewas = ?
            WHERE id = ? AND status <> 'cancelled' AND room_type_id = ? AND paid_pesewas <= ?
            RETURNING id`,
      params: [type.id, type.price_pesewas, before.id, before.room_type_id, type.price_pesewas],
    },
    auditStatement({
      actor,
      campId: before.camp_id,
      action: "registration.room_type_change",
      entity: "registration",
      entityId: before.id,
      before: { room_type_id: before.room_type_id, price_pesewas: before.price_pesewas, status: before.status },
      after: { room_type_id: type.id, price_pesewas: type.price_pesewas },
      ifChanged: true,
    }),
    refreshStatement(before.id),
    // After the update: the group trigger lets them go because their room type no longer matches.
    ...groupRemoval.statements,
    ...roomStatementsForRemoval(actor, before, reason),
  ]);
  if (!results[0].results.length) throw new CampError("This registration changed. Please refresh and try again.");

  const after = (await getRegistration(before.id))!;
  const notes = [
    group && `left their roommate group`,
    room_label && `left room ${room_label}`,
    after.status !== before.status && `is now ${after.status.replace("_", " ")}`,
  ].filter(Boolean);
  return {
    warning: notes.length ? `${before.full_name} ${notes.join(", ")}.${groupRemoval.warning ? ` ${groupRemoval.warning}` : ""}` : null,
  };
}
