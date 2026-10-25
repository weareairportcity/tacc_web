import { batch, query } from "@/lib/cf";
import { CHURCHES, FELLOWSHIPS } from "@/lib/fellowships";
import { roomStatementsForRemoval } from "./assignments";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { generateCode, hashCode, normalizeCode, CODE_LENGTH } from "./codes";
import { groupStatementsForRemoval } from "./groups";
import { getRoomType, listRoomTypes, placesFor } from "./rooms";
import {
  CampError,
  GENDERS,
  type Camp,
  type Gender,
  type Payment,
  type Registration,
  type RegistrationInput,
  type RoomType,
} from "./types";

/**
 * Attendee registrations. Payments themselves are started and settled by the
 * Worker (src/lib/camp/payments.ts); paid_pesewas and status here are the
 * cache it keeps, never written by this file except on cancel.
 */

const COLUMNS = `r.id, r.created_at, r.camp_id, r.room_type_id, t.name AS room_type_name, r.full_name, r.phone,
  r.email, r.gender, r.fellowship, r.pfcc, r.church, r.price_pesewas, r.paid_pesewas, r.status`;
const FROM = "FROM camp_registrations r JOIN camp_room_types t ON t.id = r.room_type_id";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ghana is UTC+0, so the UTC date is Accra's. */
export const todayInGhana = () => new Date().toISOString().slice(0, 10);

/** 0551112222, +233 55 111 2222 → 233551112222. Same rule as soul winning. */
export function normalizePhone(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const full = digits.startsWith("233") ? digits : digits.startsWith("0") ? `233${digits.slice(1)}` : `233${digits}`;
  return /^233\d{9}$/.test(full) ? full : null;
}

export function registrationOpen(camp: Camp, today = todayInGhana()) {
  return camp.status === "open" && today >= camp.registration_opens_on && today <= camp.registration_closes_on;
}

/** Where a camp is in its registration window, for what attendees see. */
export function registrationPhase(camp: Camp, today = todayInGhana()): "upcoming" | "open" | "closed" {
  if (camp.status === "open" && today < camp.registration_opens_on) return "upcoming";
  return registrationOpen(camp, today) ? "open" : "closed";
}

/** Whole days from today to a YYYY-MM-DD date (0 if it's today or past). */
export function daysUntil(date: string, today = todayInGhana()) {
  return Math.max(0, Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000));
}

/** Trims and checks the form. Throws CampError with every problem at once. */
export function validateRegistration(raw: RegistrationInput, roomTypes: RoomType[]) {
  const problems: string[] = [];
  const full_name = String(raw.full_name ?? "").replace(/\s+/g, " ").trim();
  if (full_name.length < 2) problems.push("Enter your full name.");
  if (full_name.length > 120) problems.push("Your name is too long.");
  const phone = normalizePhone(raw.phone);
  if (!phone) problems.push("Enter a Ghana phone number, e.g. 055 111 2222.");
  const email = String(raw.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) problems.push("Enter a valid email address.");
  if (!GENDERS.includes(raw.gender)) problems.push("Choose male or female.");
  const fellowship = FELLOWSHIPS.find((f) => f.name === raw.fellowship);
  if (!fellowship) problems.push("Choose your fellowship.");
  if (!(CHURCHES as readonly string[]).includes(raw.church)) problems.push("Choose your church.");
  const roomType = roomTypes.find((t) => t.id === raw.room_type_id);
  if (!roomType) problems.push("Choose a room type.");
  else if (GENDERS.includes(raw.gender) && placesFor(roomType, raw.gender) === 0) {
    problems.push(`${roomType.name} is full for ${raw.gender === "male" ? "men" : "women"}. Pick another room type.`);
  }

  if (problems.length) throw new CampError(problems.join(" "));
  return {
    full_name,
    phone: phone!,
    email,
    gender: raw.gender,
    fellowship: fellowship!.name,
    pfcc: fellowship!.pfcc,
    church: raw.church,
    roomType: roomType!,
  };
}

/**
 * Creates a registration and returns its sign-in code, which is shown once
 * and texted; only its hash is kept. The price is copied from the room type.
 */
export async function register(camp: Camp, raw: RegistrationInput, today = todayInGhana()) {
  if (!registrationOpen(camp, today)) throw new CampError("Registration for this camp is closed.");
  const input = validateRegistration(raw, await listRoomTypes(camp.id));

  const [existing] = await query<{ id: string }>(
    "app",
    "SELECT id FROM camp_registrations WHERE camp_id = ? AND phone = ?",
    [camp.id, input.phone],
  );
  if (existing) {
    throw new CampError(
      "This phone number is already registered for this camp. Sign in with your code, or use “Forgot your code?”.",
    );
  }

  const id = crypto.randomUUID();
  const code = generateCode();
  const price = input.roomType.price_pesewas;
  // Contact details stay out of the audit log.
  const after = { full_name: input.full_name, room_type_id: input.roomType.id, price_pesewas: price };
  const statements = [
    {
      sql: `INSERT INTO camp_registrations (id, camp_id, room_type_id, full_name, phone, email, gender, fellowship,
              pfcc, church, price_pesewas, status, code_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        camp.id,
        input.roomType.id,
        input.full_name,
        input.phone,
        input.email,
        input.gender,
        input.fellowship,
        input.pfcc,
        input.church,
        price,
        price === 0 ? "fully_paid" : "registered",
        hashCode(code),
      ],
    },
    auditStatement({ actor: `attendee:${id}`, campId: camp.id, action: "registration.create", entity: "registration", entityId: id, after }),
  ];
  try {
    await batch("app", statements);
  } catch (err) {
    // The database refuses the last place twice over (migration 0009); say so kindly.
    if (await isFull(input.roomType.id, input.gender)) {
      throw new CampError(`${input.roomType.name} filled up while you were registering. Pick another room type.`);
    }
    throw err;
  }
  return { id, code };
}

/** True if the room type has no places left for this gender. */
export async function isFull(roomTypeId: string, gender: Gender) {
  const type = await getRoomType(roomTypeId);
  return !!type && placesFor(type, gender) === 0;
}

export async function getRegistration(id: string): Promise<Registration | null> {
  const [row] = await query<Registration>("app", `SELECT ${COLUMNS} ${FROM} WHERE r.id = ?`, [checkId(id, "registration")]);
  return row ?? null;
}

/** For session checks only: the registration plus its code hash. */
export async function getRegistrationWithCode(id: string) {
  const [row] = await query<Registration & { code_hash: string }>(
    "app",
    `SELECT ${COLUMNS}, r.code_hash ${FROM} WHERE r.id = ?`,
    [checkId(id, "registration")],
  );
  if (!row) return null;
  const { code_hash, ...registration } = row;
  return { registration: registration as Registration, codeHash: code_hash };
}

/** The registration a code opens in this camp, or null. */
export async function findByCode(campId: string, rawCode: string) {
  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LENGTH) return null;
  const codeHash = hashCode(code);
  const [row] = await query<{ id: string }>(
    "app",
    "SELECT id FROM camp_registrations WHERE camp_id = ? AND code_hash = ?",
    [campId, codeHash],
  );
  return row ? { id: row.id, codeHash } : null;
}

/**
 * "Forgot your code?": issues a new code for the registration with this
 * phone, which also signs out any old session. Null if there's none.
 */
export async function resetCode(campId: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const [row] = await query<{ id: string; full_name: string }>(
    "app",
    "SELECT id, full_name FROM camp_registrations WHERE camp_id = ? AND phone = ?",
    [campId, phone],
  );
  if (!row) return null;
  const code = generateCode();
  await batch("app", [
    { sql: "UPDATE camp_registrations SET code_hash = ? WHERE id = ?", params: [hashCode(code), row.id] },
    auditStatement({ actor: `attendee:${row.id}`, campId, action: "registration.code_reset", entity: "registration", entityId: row.id }),
  ]);
  return { id: row.id, name: row.full_name, phone, code };
}

export async function listPayments(registrationId: string): Promise<Payment[]> {
  return query<Payment>(
    "app",
    `SELECT id, created_at, registration_id, reference, amount_pesewas, fee_pesewas, charged_pesewas, status, flag, paid_at
     FROM camp_payments WHERE registration_id = ? ORDER BY created_at DESC`,
    [checkId(registrationId, "registration")],
  );
}

export type FlaggedPayment = Payment & { full_name: string; phone: string };

export async function listFlaggedPayments(campId: string): Promise<FlaggedPayment[]> {
  return query<FlaggedPayment>(
    "app",
    `SELECT p.id, p.created_at, p.registration_id, p.reference, p.amount_pesewas, p.fee_pesewas, p.charged_pesewas,
            p.status, p.flag, p.paid_at, r.full_name, r.phone
     FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id
     WHERE r.camp_id = ? AND p.flag IN ('amount_mismatch', 'over_balance')
     ORDER BY p.created_at DESC`,
    [checkId(campId, "camp")],
  );
}

/**
 * Coordinator-only. Payments stay as they are; refunds happen in Paystack.
 * Also takes the person out of their roommate group and their room. Returns a
 * warning when that group was already locked.
 */
export async function cancelRegistration(actor: string, id: string): Promise<{ warning: string | null }> {
  const before = await getRegistration(id);
  if (!before) throw new CampError("Unknown registration.");
  if (before.status === "cancelled") throw new CampError("This registration is already cancelled.");
  const group = await groupStatementsForRemoval(actor, before, "registration cancelled");
  await batch("app", [
    { sql: "UPDATE camp_registrations SET status = 'cancelled' WHERE id = ? AND status <> 'cancelled'", params: [id] },
    auditStatement({
      actor,
      campId: before.camp_id,
      action: "registration.cancel",
      entity: "registration",
      entityId: id,
      before: { status: before.status, paid_pesewas: before.paid_pesewas },
      after: { status: "cancelled" },
    }),
    // After the status change: the group trigger lets a cancelled person go even from a locked group.
    ...group.statements,
    ...roomStatementsForRemoval(actor, before, "registration cancelled"),
  ]);
  return { warning: group.warning };
}
