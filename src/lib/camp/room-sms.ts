import { batch, query } from "@/lib/cf";
import { COMMUNE_SENDER, sendSMS } from "@/lib/mnotify";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import type { Camp } from "./types";

/**
 * "Text everyone their room": one text per person, greeting them by first
 * name. camp_room_sms remembers who was told which room, so a second press
 * only reaches people who are new or have moved. Capped per press so one
 * server request stays short; the page shows what's left.
 */

export const MAX_PER_SEND = 250;
const PARALLEL = 10;

type Pending = { registration_id: string; full_name: string; phone: string; room_id: string; label: string; room_type_name: string };

/** Placed, not cancelled, and not yet told about the room they're in now. */
export function listRoomSmsPending(campId: string): Promise<Pending[]> {
  return query<Pending>(
    "app",
    `SELECT r.id AS registration_id, r.full_name, r.phone, x.id AS room_id, x.label, t.name AS room_type_name
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

export const roomText = (camp: Pick<Camp, "name">, firstName: string, label: string, type: string) =>
  `Hi ${firstName}, your room at ${camp.name} is ${label} (${type}). See you there! - The Airport City Church`;

/**
 * Sends up to MAX_PER_SEND people their room. A text that fails isn't marked
 * sent, so the next press retries it. `send` is mNotify by default.
 */
export async function sendRoomSms(actor: string, camp: Camp, send = (to: string, text: string) => sendSMS(to, text, COMMUNE_SENDER)) {
  const pending = await listRoomSmsPending(camp.id);
  const batchOf = pending.slice(0, MAX_PER_SEND);
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < batchOf.length; i += PARALLEL) {
    await Promise.all(
      batchOf.slice(i, i + PARALLEL).map(async (p) => {
        const ok = await send(p.phone, roomText(camp, p.full_name.split(" ")[0], p.label, p.room_type_name)).catch(() => false);
        if (!ok) {
          failed++;
          return;
        }
        await batch("app", [
          {
            sql: `INSERT INTO camp_room_sms (registration_id, room_id) VALUES (?, ?)
                  ON CONFLICT (registration_id) DO UPDATE SET room_id = excluded.room_id,
                    sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
            params: [p.registration_id, p.room_id],
          },
        ]);
        sent++;
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
      after: { sent, failed },
    }),
  ]);
  return { sent, failed, remaining: pending.length - sent };
}
