import { newRequest, requestAnswered } from "./notify";
import { batch, query } from "@/lib/cf";
import { changeRoomType, recordRefund } from "./adjustments";
import { auditStatement } from "./audit";
import { checkId, getCamp } from "./camps";
import { formatCedis } from "./money";
import { refundRequestStatement } from "./profile";
import { getRegistration } from "./registrations";
import { getRoomType, placesFor } from "./rooms";
import { CampError, type CampRequest, type Registration, type RequestStatus } from "./types";

/**
 * Requests: refunds and room-type changes. Attendees ask; a coordinator
 * decides, case by case. expressPay has no refund API, so a coordinator sends
 * the money by hand (MoMo or bank) and approving records it, with the
 * reference. Approving a room change applies the new price: an upgrade leaves
 * more to pay; a downgrade records the refund of the difference first.
 */

const actorOf = (me: Registration) => `attendee:${me.id}`;

/** "Your request was answered", on their phone. */
async function tellAttendee(request: CampRequest, text: string) {
  const camp = await getCamp(request.camp_id).catch(() => null);
  if (camp) await requestAnswered(request.registration_id, camp.slug, text);
}

const SELECT = `SELECT q.id, q.created_at, q.camp_id, q.registration_id, r.full_name, r.fellowship, t.name AS room_type_name,
    q.kind, q.status, q.amount_pesewas, q.to_room_type_id, n.name AS to_room_type_name, n.price_pesewas AS to_price_pesewas,
    r.price_pesewas, r.paid_pesewas, r.status AS registration_status, q.reason, q.requested_by, q.decided_by, q.decided_at,
    q.decision_note
  FROM camp_requests q
  JOIN camp_registrations r ON r.id = q.registration_id
  JOIN camp_room_types t ON t.id = r.room_type_id
  LEFT JOIN camp_room_types n ON n.id = q.to_room_type_id`;

export function listRequests(campId: string, status: "pending" | "done"): Promise<CampRequest[]> {
  return query<CampRequest>(
    "app",
    `${SELECT} WHERE q.camp_id = ? AND ${status === "pending" ? "q.status = 'pending'" : "q.status <> 'pending'"}
     ORDER BY ${status === "pending" ? "q.created_at" : "q.decided_at DESC"} LIMIT 200`,
    [checkId(campId, "camp")],
  );
}

export async function getRequest(id: string): Promise<CampRequest | null> {
  const [row] = await query<CampRequest>("app", `${SELECT} WHERE q.id = ?`, [checkId(id, "request")]);
  return row ?? null;
}

/** The attendee's own requests, newest first. */
export function listMyRequests(me: Registration): Promise<CampRequest[]> {
  return query<CampRequest>("app", `${SELECT} WHERE q.registration_id = ? ORDER BY q.created_at DESC`, [me.id]);
}

// ─── Asking ──────────────────────────────────────────────────────────────────

/** A refund while still coming (paid twice, say). Cancelling asks for one by itself. */
export async function askForRefund(me: Registration, amountPesewas: number, reason: string) {
  if (!Number.isInteger(amountPesewas) || amountPesewas <= 0) throw new CampError("Enter how much you'd like back.");
  if (amountPesewas > me.paid_pesewas) throw new CampError(`You've paid ${formatCedis(me.paid_pesewas)}, so the refund can't be more.`);
  const text = String(reason ?? "").trim();
  if (text.length < 3) throw new CampError("Tell us why, in a few words.");
  const insert = refundRequestStatement(me, amountPesewas, text, actorOf(me));
  const results = await batch("app", [
    { ...insert, sql: `${insert.sql} RETURNING id` },
    auditStatement({ actor: actorOf(me), campId: me.camp_id, action: "request.refund", entity: "registration", entityId: me.id, after: { amount_pesewas: amountPesewas }, ifChanged: true }),
  ]);
  if (!results[0].results.length) throw new CampError("You already have a refund request waiting.");
  await newRequest(me, { refund: amountPesewas });
}

export async function askForRoomChange(me: Registration, roomTypeId: string, reason: string) {
  if (me.status === "cancelled") throw new CampError("Your registration is cancelled.");
  const type = await getRoomType(checkId(roomTypeId, "room type"));
  if (!type || type.camp_id !== me.camp_id) throw new CampError("Choose a room type from this camp.");
  if (type.id === me.room_type_id) throw new CampError(`You're already in ${type.name}.`);
  if (placesFor(type, me.gender) === 0) throw new CampError(`${type.name} is full.`);
  const results = await batch("app", [
    {
      sql: `INSERT INTO camp_requests (id, camp_id, registration_id, kind, to_room_type_id, reason, requested_by)
            SELECT ?, ?, ?, 'room_change', ?, ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM camp_requests WHERE registration_id = ? AND kind = 'room_change' AND status = 'pending')
            RETURNING id`,
      params: [crypto.randomUUID(), me.camp_id, me.id, type.id, String(reason ?? "").trim().slice(0, 500), actorOf(me), me.id],
    },
    auditStatement({ actor: actorOf(me), campId: me.camp_id, action: "request.room_change", entity: "registration", entityId: me.id, after: { to_room_type_id: type.id }, ifChanged: true }),
  ]);
  if (!results[0].results.length) throw new CampError("You already asked to change rooms. Withdraw that request first.");
  await newRequest(me, { room: type.name });
}

export async function withdrawRequest(me: Registration, requestId: string) {
  const results = await batch("app", [
    {
      sql: `UPDATE camp_requests SET status = 'withdrawn', decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ? AND registration_id = ? AND status = 'pending' RETURNING id`,
      params: [checkId(requestId, "request"), me.id],
    },
    auditStatement({ actor: actorOf(me), campId: me.camp_id, action: "request.withdraw", entity: "request", entityId: requestId, ifChanged: true }),
  ]);
  if (!results[0].results.length) throw new CampError("That request has already been decided.");
}

// ─── Deciding ────────────────────────────────────────────────────────────────

function decide(actor: string, request: CampRequest, status: RequestStatus, note: string) {
  return [
    {
      sql: `UPDATE camp_requests SET status = ?, decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), decision_note = ?
            WHERE id = ? AND status = 'pending' RETURNING id`,
      params: [status, actor, note.slice(0, 500), request.id],
    },
    auditStatement({
      actor,
      campId: request.camp_id,
      action: `request.${status === "approved" ? "approve" : "decline"}`,
      entity: "request",
      entityId: request.id,
      after: { kind: request.kind, registration_id: request.registration_id },
      ifChanged: true,
    }),
  ];
}

async function pending(id: string) {
  const request = await getRequest(id);
  if (!request) throw new CampError("Unknown request.");
  if (request.status !== "pending") throw new CampError("Someone has already decided this request.");
  return request;
}

export async function declineRequest(actor: string, id: string, note: string) {
  const request = await pending(id);
  const results = await batch("app", decide(actor, request, "declined", String(note ?? "").trim()));
  if (!results[0].results.length) throw new CampError("Someone has already decided this request.");
  const what = request.kind === "refund" ? "Your refund request" : `Your request to move to ${request.to_room_type_name}`;
  await tellAttendee(request, `${what} was not approved.${String(note ?? "").trim() ? ` Note: ${String(note).trim().slice(0, 200)}` : ""}`);
  return request;
}

const refundReference = (raw: string) => {
  const reference = String(raw ?? "").trim().slice(0, 100);
  if (reference.length < 3) throw new CampError("Enter the reference for the money you sent back (the MoMo or bank transaction ID).");
  return reference;
};

/**
 * Records a refund the coordinator has already sent by hand, and marks the
 * request approved. Amount may be less than asked.
 */
export async function approveRefund(actor: string, id: string, amountPesewas: number, note: string, reference: string) {
  const request = await pending(id);
  if (request.kind !== "refund") throw new CampError("That isn't a refund request.");
  if (!Number.isInteger(amountPesewas) || amountPesewas <= 0) throw new CampError("Enter the amount you sent back.");
  if (amountPesewas > request.paid_pesewas) throw new CampError(`${request.full_name} has paid ${formatCedis(request.paid_pesewas)}.`);
  const ref = refundReference(reference);
  // Claim the request first, so two coordinators can't both record it.
  const claimed = await batch("app", decide(actor, request, "approved", String(note ?? "").trim()));
  if (!claimed[0].results.length) throw new CampError("Someone has already decided this request.");
  try {
    const recorded = await recordRefund(actor, request.registration_id, { amount_pesewas: amountPesewas, reference: ref, note: String(note ?? "") }, request.id);
    await tellAttendee(request, `Your refund of ${formatCedis(amountPesewas)} was approved and sent to you.`);
    return { request, refunded_pesewas: amountPesewas, warning: recorded.warning };
  } catch (err) {
    // Nothing was recorded: put the request back for another try.
    await batch("app", [{ sql: "UPDATE camp_requests SET status = 'pending', decided_by = NULL, decided_at = NULL WHERE id = ?", params: [request.id] }]);
    throw err;
  }
}

/**
 * Moves them to the room type they asked for. Up: the new price applies and
 * the rest is theirs to pay. Down, having paid more than the new price: the
 * coordinator sends the difference back by hand first, and approving records
 * that refund (with its reference) before the move.
 */
export async function approveRoomChange(actor: string, id: string, note: string, reference = "") {
  const request = await pending(id);
  if (request.kind !== "room_change" || !request.to_room_type_id || request.to_price_pesewas === null) {
    throw new CampError("That isn't a room change request.");
  }
  const overpaid = request.paid_pesewas - request.to_price_pesewas;
  const ref = overpaid > 0 ? refundReference(reference) : "";
  const claimed = await batch("app", decide(actor, request, "approved", String(note ?? "").trim()));
  if (!claimed[0].results.length) throw new CampError("Someone has already decided this request.");
  try {
    if (overpaid > 0) {
      await recordRefund(actor, request.registration_id, { amount_pesewas: overpaid, reference: ref, note: `Moved to ${request.to_room_type_name}` }, request.id);
    }
    const moved = await changeRoomType(actor, request.registration_id, request.to_room_type_id);
    await tellAttendee(request, `You've been moved to ${request.to_room_type_name}.${overpaid > 0 ? ` We sent ${formatCedis(overpaid)} back to you.` : ""}`);
    return { request, refunded: Math.max(0, overpaid), warning: moved.warning };
  } catch (err) {
    const now = await getRegistration(request.registration_id);
    // Only reopen if nothing was recorded; a refund that went out stays recorded.
    if (now && now.paid_pesewas === request.paid_pesewas) {
      await batch("app", [{ sql: "UPDATE camp_requests SET status = 'pending', decided_by = NULL, decided_at = NULL WHERE id = ?", params: [request.id] }]);
    }
    throw err;
  }
}
