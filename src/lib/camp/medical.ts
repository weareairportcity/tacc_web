import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { CampError } from "./types";

/**
 * The medical team's view of one person: what they need to help someone at
 * camp. Health notes, emergency contact (and guardian for under-18s), their
 * own phone, their room and each roommate's name and phone. Every search,
 * look and call is written to the History, since these are health details.
 */

export type Roommate = { id: string; full_name: string; phone: string };

export type MedicalCard = {
  id: string;
  full_name: string;
  phone: string;
  gender: "male" | "female";
  fellowship: string;
  status: string;
  health_notes: string;
  emergency_name: string;
  emergency_phone: string;
  is_minor: number;
  guardian_name: string;
  guardian_phone: string;
  room_type_name: string;
  room_label: string | null;
  roommates: Roommate[];
};

export async function medicalCard(actor: string, campId: string, registrationId: string): Promise<MedicalCard> {
  checkId(campId, "camp");
  checkId(registrationId, "registration");
  const [person] = await query<Omit<MedicalCard, "roommates">>(
    "app",
    `SELECT r.id, r.full_name, r.phone, r.gender, r.fellowship, r.status, r.health_notes, r.emergency_name, r.emergency_phone,
       r.is_minor, r.guardian_name, r.guardian_phone, t.name AS room_type_name, x.label AS room_label
     FROM camp_registrations r
     JOIN camp_room_types t ON t.id = r.room_type_id
     LEFT JOIN camp_room_assignments a ON a.registration_id = r.id
     LEFT JOIN camp_rooms x ON x.id = a.room_id
     WHERE r.id = ? AND r.camp_id = ? AND r.deleted_at IS NULL`,
    [registrationId, campId],
  );
  if (!person) throw new CampError("That person isn't registered for this camp.");
  const [roommates] = await Promise.all([
    query<Roommate>(
      "app",
      `SELECT o.id, o.full_name, o.phone FROM camp_room_assignments a
       JOIN camp_room_assignments b ON b.room_id = a.room_id AND b.registration_id <> a.registration_id
       JOIN camp_registrations o ON o.id = b.registration_id
       WHERE a.registration_id = ? ORDER BY o.full_name COLLATE NOCASE`,
      [registrationId],
    ),
    batch("app", [auditStatement({ actor, campId, action: "medical.view", entity: "registration", entityId: registrationId })]),
  ]);
  return { ...person, roommates };
}

/**
 * A search in the History, once they've stopped typing (the page sends it
 * after a pause, or when they open someone). The same term twice within a
 * minute is one entry. Opening a person is always logged on its own
 * (medicalCard), since that's where the health details are.
 */
export async function logMedicalSearch(actor: string, campId: string, raw: string) {
  const term = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (term.length < 2) return;
  const note = `“${term}”`;
  const [same] = await query<{ id: number }>(
    "app",
    `SELECT id FROM camp_audit_log WHERE camp_id = ? AND actor = ? AND action = 'medical.search'
       AND json_extract(after_json, '$.note') = ? AND created_at >= ? LIMIT 1`,
    [checkId(campId, "camp"), actor, note, new Date(Date.now() - 60_000).toISOString()],
  );
  if (same) return;
  await batch("app", [auditStatement({ actor, campId, action: "medical.search", entity: "search", entityId: campId, after: { note } })]);
}

export type CallWho = "self" | "emergency" | "guardian" | `roommate:${string}`;

/** A tap on a Call button, in the History: who was called, about whom. The name is read here, not taken from the page. */
export async function logMedicalCall(actor: string, campId: string, registrationId: string, who: CallWho) {
  checkId(campId, "camp");
  checkId(registrationId, "registration");
  const [p] = await query<{ full_name: string; emergency_name: string; guardian_name: string }>(
    "app",
    "SELECT full_name, emergency_name, guardian_name FROM camp_registrations WHERE id = ? AND camp_id = ?",
    [registrationId, campId],
  );
  if (!p) throw new CampError("That person isn't registered for this camp.");
  let note: string;
  if (who === "self") note = "them";
  else if (who === "emergency") note = `their emergency contact${p.emergency_name ? ` (${p.emergency_name})` : ""}`;
  else if (who === "guardian") note = `their parent or guardian${p.guardian_name ? ` (${p.guardian_name})` : ""}`;
  else if (who.startsWith("roommate:")) {
    const [r] = await query<{ full_name: string }>(
      "app",
      `SELECT o.full_name FROM camp_room_assignments a
       JOIN camp_room_assignments b ON b.room_id = a.room_id
       JOIN camp_registrations o ON o.id = b.registration_id
       WHERE a.registration_id = ? AND b.registration_id = ?`,
      [registrationId, checkId(who.slice("roommate:".length), "registration")],
    );
    if (!r) throw new CampError("That roommate isn't in their room.");
    note = `their roommate ${r.full_name}`;
  } else throw new CampError("Unknown call.");
  await batch("app", [auditStatement({ actor, campId, action: "medical.call", entity: "registration", entityId: registrationId, after: { note } })]);
}
