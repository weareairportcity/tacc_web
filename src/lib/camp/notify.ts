import { post, query } from "@/lib/cf";
import { formatCedis } from "./money";

/**
 * Notifications from the Next side (registrations, requests, cancellations,
 * rooms). The Worker sends them: Telegram for the coordinators' group, app
 * notifications on phones (workers/soulwinning/src/notify.ts). Plain words,
 * no technical detail. A notification that fails never fails the action.
 */

/** `lines`: the Telegram message, one "Label: value" per line (a string is a section heading). */
type Message = { title: string; body: string; url: string; lines?: ([string, string] | string)[] };
type StaffKind = "registration" | "request" | "cancellation";
type AttendeeKind = "room_ready" | "request_answered";

async function send(body: Record<string, unknown>) {
  try {
    await post("/v1/admin/camp/notify", body);
  } catch (err) {
    console.error("notify", body.kind, err);
  }
}

export const notifyStaff = (kind: StaffKind, m: Message) => send({ to: "staff", kind, ...m });
export const notifyAttendee = (registrationId: string, kind: AttendeeKind, m: Message) => send({ to: "attendee", kind, registration_id: registrationId, ...m });

const people = (campId: string, registrationId: string) => `/admin/camp/${campId}/people?person=${registrationId}`;

export async function newRegistration(r: {
  id: string;
  camp_id: string;
  full_name: string;
  camp_name: string;
  room_type_name: string;
  price_pesewas: number;
  gender: string;
  fellowship: string;
  pfcc: string;
  church: string;
}) {
  const [count] = await query<{ n: number }>("app", "SELECT COUNT(*) AS n FROM camp_registrations WHERE camp_id = ? AND status <> 'cancelled'", [r.camp_id]).catch(() => []);
  await notifyStaff("registration", {
    title: "New registration",
    body: `${r.full_name} registered for ${r.camp_name} (${r.room_type_name}).`,
    url: people(r.camp_id, r.id),
    lines: [
      ["Name", r.full_name],
      ["Gender", r.gender === "male" ? "Male" : r.gender === "female" ? "Female" : r.gender],
      ["Fellowship", [r.fellowship, r.pfcc].filter(Boolean).join(", ") || r.church],
      ["Room type", `${r.room_type_name} (${formatCedis(r.price_pesewas)})`],
      ["Camp", r.camp_name],
      ["Registered so far", count ? String(count.n) : ""],
    ],
  });
}

export const newRequest = (r: { camp_id: string; full_name: string; paid_pesewas: number; room_type_name: string }, what: { refund: number } | { room: string }, reason: string) =>
  notifyStaff("request", {
    title: "refund" in what ? "New refund request" : "New room change request",
    body: "refund" in what ? `${r.full_name} asked for ${formatCedis(what.refund)} back.` : `${r.full_name} asked to move to ${what.room}.`,
    url: `/admin/camp/${r.camp_id}/requests`,
    lines: [
      ["Attendee", r.full_name],
      "refund" in what ? ["Asking for", `${formatCedis(what.refund)} back`] : ["Wants to move", `from ${r.room_type_name} to ${what.room}`],
      ["Paid so far", formatCedis(r.paid_pesewas)],
      ["Reason", reason.trim().slice(0, 200)],
      ["What to do", "Open Requests in Commune to decide."],
    ],
  });

export const cancelled = (r: { id: string; camp_id: string; full_name: string; paid_pesewas: number; room_type_name: string }, reason: string, removed: boolean) =>
  notifyStaff("cancellation", {
    title: removed ? "Registration cancelled and details deleted" : "Registration cancelled",
    body: `${r.full_name} cancelled their registration.${r.paid_pesewas > 0 ? ` They had paid ${formatCedis(r.paid_pesewas)}, so a refund request is waiting.` : ""}`,
    url: people(r.camp_id, r.id),
    lines: [
      ["Attendee", r.full_name],
      ["Room type", r.room_type_name],
      ["Had paid", formatCedis(r.paid_pesewas)],
      ["Refund", r.paid_pesewas > 0 ? "A refund request is waiting in Requests." : "Nothing to refund."],
      ["Reason", reason.trim().slice(0, 200)],
    ],
  });

export const requestAnswered = (registrationId: string, slug: string, text: string) =>
  notifyAttendee(registrationId, "request_answered", { title: "Your request was answered", body: text, url: `/camps/${slug}/me` });

export const roomReady = (registrationId: string, slug: string, campName: string, label: string, type: string) =>
  notifyAttendee(registrationId, "room_ready", {
    title: "Your room is ready",
    body: `You're in ${label} (${type}) at ${campName}.`,
    url: `/camps/${slug}/me/room`,
  });
