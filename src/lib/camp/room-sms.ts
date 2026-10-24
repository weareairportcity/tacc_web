import { batch, query } from "@/lib/cf";
import { sendSMS } from "@/lib/mnotify";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import type { Camp } from "./types";

/**
 * "Text everyone their room": one mNotify request per room (everyone in it
 * gets the same text). camp_room_sms remembers who was told which room, so a
 * second press only reaches people who are new or have moved. Capped per
 * press so one server request stays short; the page shows what's left.
 */

export const MAX_PER_SEND = 250;
const PARALLEL = 5;

type Pending = { registration_id: string; phone: string; room_id: string; label: string; room_type_name: string };

/** Placed, not cancelled, and not yet told about the room they're in now. */
export function listRoomSmsPending(campId: string): Promise<Pending[]> {
  return query<Pending>(
    "app",
    `SELECT r.id AS registration_id, r.phone, x.id AS room_id, x.label, t.name AS room_type_name
     FROM camp_room_assignments a
     JOIN camp_registrations r ON r.id = a.registration_id
     JOIN camp_rooms x ON x.id = a.room_id
     JOIN camp_room_types t ON t.id = x.room_type_id
     WHERE x.camp_id = ? AND r.status <> 'cancelled'
       AND NOT EXISTS (SELECT 1 FROM camp_room_sms s WHERE s.registration_id = r.id AND s.room_id = a.room_id)
     ORDER BY x.label`,
    [checkId(campId, "camp")],
  );
}

export const roomText = (camp: Camp, label: string, type: string, origin: string) =>
  `TACC ${camp.name}: your room is ${label} (${type}). See it and your roommates at ${origin}/camps/${camp.slug}/me`;

/**
 * Sends up to MAX_PER_SEND people their room. A room whose text fails isn't
 * marked sent, so the next press retries it. `send` is mNotify by default.
 */
export async function sendRoomSms(actor: string, camp: Camp, origin: string, send = sendSMS) {
  const pending = await listRoomSmsPending(camp.id);
  const byRoom = new Map<string, Pending[]>();
  let taken = 0;
  for (const p of pending) {
    const room = byRoom.get(p.room_id);
    // Keep a room's people together, and stop at the cap.
    if (!room && taken + 1 > MAX_PER_SEND) break;
    if (room) room.push(p);
    else byRoom.set(p.room_id, [p]);
    taken++;
  }

  const rooms = [...byRoom.values()];
  let sent = 0;
  let failedRooms = 0;
  for (let i = 0; i < rooms.length; i += PARALLEL) {
    await Promise.all(
      rooms.slice(i, i + PARALLEL).map(async (people) => {
        const ok = await send(
          people.map((p) => p.phone),
          roomText(camp, people[0].label, people[0].room_type_name, origin),
        ).catch(() => false);
        if (!ok) {
          failedRooms++;
          return;
        }
        await batch(
          "app",
          people.map((p) => ({
            sql: `INSERT INTO camp_room_sms (registration_id, room_id) VALUES (?, ?)
                  ON CONFLICT (registration_id) DO UPDATE SET room_id = excluded.room_id,
                    sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
            params: [p.registration_id, p.room_id],
          })),
        );
        sent += people.length;
      }),
    );
  }

  await batch("app", [
    auditStatement({
      actor,
      campId: camp.id,
      action: "room.sms",
      entity: "camp",
      entityId: camp.id,
      after: { sent, failed_rooms: failedRooms },
    }),
  ]);
  return { sent, failedRooms, remaining: pending.length - sent };
}
