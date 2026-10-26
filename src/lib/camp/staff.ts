import { batch, query } from "@/lib/cf";
import { FELLOWSHIPS, PFCCS } from "@/lib/fellowships";
import { auditStatement } from "./audit";
import { CampError, STAFF_ROLES, type Staff } from "./types";

/** Camp staff roles (camp_staff). Only admins call these. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function listStaff(): Promise<Staff[]> {
  return query<Staff>("app", "SELECT email, role, scope_kind, scope_value FROM camp_staff ORDER BY role, email");
}

export function validateStaff(raw: Staff): Staff {
  const email = String(raw.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) throw new CampError("Enter a valid email.");
  if (!STAFF_ROLES.includes(raw.role)) throw new CampError("Unknown role.");
  if (raw.role !== "leader") return { email, role: raw.role, scope_kind: null, scope_value: null };

  const value = String(raw.scope_value ?? "").trim();
  const ok =
    (raw.scope_kind === "fellowship" && FELLOWSHIPS.some((f) => f.name === value)) ||
    (raw.scope_kind === "pfcc" && (PFCCS as string[]).includes(value));
  if (!ok) throw new CampError("A leader needs one fellowship or one PFCC.");
  return { email, role: "leader", scope_kind: raw.scope_kind, scope_value: value };
}

export async function saveStaff(actor: string, raw: Staff) {
  const staff = validateStaff(raw);
  const [before] = await query<Staff>("app", "SELECT email, role, scope_kind, scope_value FROM camp_staff WHERE email = ?", [
    staff.email,
  ]);
  await batch("app", [
    {
      sql: `INSERT INTO camp_staff (email, role, scope_kind, scope_value) VALUES (?, ?, ?, ?)
            ON CONFLICT (email) DO UPDATE SET role = excluded.role, scope_kind = excluded.scope_kind,
              scope_value = excluded.scope_value`,
      params: [staff.email, staff.role, staff.scope_kind, staff.scope_value],
    },
    auditStatement({
      actor,
      campId: null,
      action: before ? "staff.update" : "staff.create",
      entity: "staff",
      entityId: staff.email,
      before,
      after: staff,
    }),
  ]);
}

export async function removeStaff(actor: string, email: string) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (normalized === actor.toLowerCase()) throw new CampError("You can't remove yourself.");
  const [before] = await query<Staff>("app", "SELECT email, role, scope_kind, scope_value FROM camp_staff WHERE email = ?", [
    normalized,
  ]);
  if (!before) throw new CampError("Unknown staff member.");
  await batch("app", [
    { sql: "DELETE FROM camp_staff WHERE email = ?", params: [normalized] },
    auditStatement({ actor, campId: null, action: "staff.remove", entity: "staff", entityId: normalized, before }),
  ]);
}

/** A coordinator's own phone, for the evening summary text. Empty turns the text off. */
export async function setStaffPhone(staff: Staff, rawPhone: string) {
  const digits = String(rawPhone ?? "").replace(/\D/g, "");
  const phone = !digits ? "" : digits.startsWith("233") ? digits : digits.startsWith("0") ? `233${digits.slice(1)}` : `233${digits}`;
  if (phone && !/^233\d{9}$/.test(phone)) throw new CampError("Enter a Ghana phone number, e.g. 055 111 2222.");
  // Bootstrap admins (CAMP_ADMIN_EMAILS) may not have a row yet.
  await batch("app", [
    {
      sql: `INSERT INTO camp_staff (email, role, phone) VALUES (?, ?, ?)
            ON CONFLICT (email) DO UPDATE SET phone = excluded.phone`,
      params: [staff.email, staff.role === "leader" ? "coordinator" : staff.role, phone],
    },
  ]);
  return phone;
}

export async function getStaffPhone(email: string) {
  const [row] = await query<{ phone: string }>("app", "SELECT phone FROM camp_staff WHERE email = ?", [email]);
  return row?.phone ?? "";
}
