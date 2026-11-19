import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { CampError } from "./types";

/**
 * The medical team's view of one person: what they need to help someone at
 * camp. Health notes, emergency contact (and guardian for under-18s), their
 * own phone, their room and each roommate's name and phone. Every look is
 * written to the History, since these are health details.
 */

export type Roommate = { full_name: string; phone: string };

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
      `SELECT o.full_name, o.phone FROM camp_room_assignments a
       JOIN camp_room_assignments b ON b.room_id = a.room_id AND b.registration_id <> a.registration_id
       JOIN camp_registrations o ON o.id = b.registration_id
       WHERE a.registration_id = ? ORDER BY o.full_name COLLATE NOCASE`,
      [registrationId],
    ),
    batch("app", [auditStatement({ actor, campId, action: "medical.view", entity: "registration", entityId: registrationId })]),
  ]);
  return { ...person, roommates };
}
