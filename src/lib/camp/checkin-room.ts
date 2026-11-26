import { batch, query } from "@/lib/cf";
import { COMMUNE_SENDER, sendSMS } from "@/lib/mnotify";
import { assignPerson } from "./assignments";
import { auditStatement } from "./audit";
import { getCamp } from "./camps";
import { nextRoomLabels } from "./fill";
import { pushMany } from "./notify";
import { getRegistration } from "./registrations";
import { listRooms, getRoomType } from "./rooms";
import { logCampSms } from "./sms-log";
import { smsPartsOf } from "@/lib/sms-plain";
import { CampError } from "./types";

/**
 * Checking someone in gives them a bed. Someone already in a room (they made
 * one, or a friend's group link put them in one) just keeps it. Everyone else
 * goes into a room Commune opens for check-ins: the one still filling, or a
 * new one (named like M-FAN8-05) when it's full, always for their room type
 * and gender and never with more beds than the room type allows. Those rooms
 * are marked "source: checkin" in the audit log, so they're the only rooms
 * this fills.
 */

type Open = { id: string; label: string };

async function placedRoom(registrationId: string) {
  const [row] = await query<{ label: string }>(
    "app",
    "SELECT x.label FROM camp_room_assignments a JOIN camp_rooms x ON x.id = a.room_id WHERE a.registration_id = ?",
    [registrationId],
  );
  return row?.label ?? null;
}

/** The check-in room still filling for this room type and gender: the fullest one with a free bed. */
async function fillingRoom(campId: string, roomTypeId: string, gender: string): Promise<Open | null> {
  const [row] = await query<Open>(
    "app",
    `SELECT x.id, x.label FROM camp_rooms x
     WHERE x.camp_id = ? AND x.room_type_id = ? AND x.gender = ?
       AND x.id IN (SELECT entity_id FROM camp_audit_log WHERE action = 'room.create' AND json_extract(after_json, '$.source') = 'checkin')
       AND x.capacity > (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id)
     ORDER BY (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id) DESC, x.label
     LIMIT 1`,
    [campId, roomTypeId, gender],
  );
  return row ?? null;
}

async function openRoom(actor: string, person: { camp_id: string; room_type_id: string; gender: "male" | "female" }): Promise<Open> {
  const type = await getRoomType(person.room_type_id);
  if (!type) throw new CampError("Unknown room type.");
  for (let attempt = 0; attempt < 3; attempt++) {
    const labels = (await listRooms(person.camp_id)).map((r) => r.label);
    const [label] = nextRoomLabels(labels, person.gender, type.name, type.capacity, 1);
    const id = crypto.randomUUID();
    try {
      await batch("app", [
        {
          sql: "INSERT INTO camp_rooms (id, camp_id, room_type_id, label, gender, capacity) VALUES (?, ?, ?, ?, ?, ?)",
          params: [id, person.camp_id, type.id, label, person.gender, type.capacity],
        },
        auditStatement({
          actor,
          campId: person.camp_id,
          action: "room.create",
          entity: "room",
          entityId: id,
          after: { label, room_type_id: type.id, gender: person.gender, capacity: type.capacity, source: "checkin" },
        }),
      ]);
      return { id, label };
    } catch (err) {
      // Someone else took that number at the same moment: take the next.
      if (attempt === 2) throw err;
    }
  }
  throw new CampError("Couldn't open a room.");
}

export const checkInRoomText = (first: string) =>
  `Hi ${first}, you're checked in and your room is ready. Open Commune on your home page to see your room and roommates. - The Airport City Church`;

/** Tells them: the app first (free), a text only if the app didn't reach them. No link. Marks the room as told, so "Tell everyone their room" skips them. */
async function tell(person: { id: string; camp_id: string; full_name: string; phone: string }, roomId: string) {
  const camp = await getCamp(person.camp_id);
  if (!camp) return;
  const first = person.full_name.trim().split(/\s+/)[0];
  const { delivered } = await pushMany([
    {
      registration_id: person.id,
      kind: "room_ready",
      title: "You're checked in",
      body: "Your room is ready. Open Commune on your home page to see your room and roommates.",
      url: `/camps/${camp.slug}/me`,
    },
  ]);
  let told = delivered.has(person.id);
  if (!told && /^233\d{9}$/.test(person.phone)) {
    const text = checkInRoomText(first);
    if (await sendSMS(person.phone, text, COMMUNE_SENDER).catch(() => false)) {
      told = true;
      await logCampSms({ campId: camp.id, kind: "room", texts: 1, credits: smsPartsOf(text) });
    }
  } else if (told) {
    await logCampSms({ campId: camp.id, kind: "room", texts: 0, credits: 0, pushed: 1 });
  }
  if (told) {
    await batch("app", [
      {
        sql: `INSERT INTO camp_room_sms (registration_id, room_id) VALUES (?, ?)
              ON CONFLICT (registration_id) DO UPDATE SET room_id = excluded.room_id, sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        params: [person.id, roomId],
      },
    ]);
  }
}

/**
 * The room to show when someone checks in: theirs already, or one found or
 * opened for them (and they're told). Never throws: a person who can't be
 * placed is still checked in, with a warning for the desk.
 */
export async function roomOnCheckIn(actor: string, registrationId: string): Promise<{ label: string | null; placed: boolean; warning: string | null }> {
  try {
    const person = await getRegistration(registrationId);
    if (!person) return { label: null, placed: false, warning: null };
    const already = await placedRoom(person.id);
    if (already) return { label: already, placed: false, warning: null };
    if (person.status !== "fully_paid") return { label: null, placed: false, warning: null };

    let room = await fillingRoom(person.camp_id, person.room_type_id, person.gender);
    let created = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!room) {
        room = await openRoom(actor, person);
        created = true;
      }
      try {
        await assignPerson(actor, room.id, person.id);
        await tell({ id: person.id, camp_id: person.camp_id, full_name: person.full_name, phone: person.phone }, room.id);
        return { label: room.label, placed: true, warning: null };
      } catch (err) {
        // It filled up meanwhile (another check-in at the same moment): try the next, or open another.
        if (created) await query("app", "DELETE FROM camp_rooms WHERE id = ? AND NOT EXISTS (SELECT 1 FROM camp_room_assignments WHERE room_id = ?)", [room.id, room.id]).catch(() => undefined);
        room = null;
        created = false;
        if (attempt === 2) throw err;
      }
    }
    return { label: null, placed: false, warning: "No room could be found" };
  } catch (err) {
    console.error("check-in room", err);
    return { label: null, placed: false, warning: "Checked in, but no room could be given yet. A coordinator can place them." };
  }
}
