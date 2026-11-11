import { post } from "@/lib/cf";
import { formatCedis } from "./money";

/**
 * Notifications from the Next side (registrations, requests, cancellations,
 * rooms). The Worker sends them: Telegram for the coordinators' group, app
 * notifications on phones (workers/soulwinning/src/notify.ts). Plain words,
 * no technical detail. A notification that fails never fails the action.
 */

type Message = { title: string; body: string; url: string };
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

export const newRegistration = (r: { id: string; camp_id: string; full_name: string; camp_name: string; room_type_name: string }) =>
  notifyStaff("registration", {
    title: "New registration",
    body: `${r.full_name} registered for ${r.camp_name} (${r.room_type_name}).`,
    url: people(r.camp_id, r.id),
  });

export const newRequest = (r: { camp_id: string; full_name: string }, what: { refund: number } | { room: string }) =>
  notifyStaff("request", {
    title: "New request",
    body: "refund" in what ? `${r.full_name} asked for ${formatCedis(what.refund)} back.` : `${r.full_name} asked to move to ${what.room}.`,
    url: `/admin/camp/${r.camp_id}/requests`,
  });

export const cancelled = (r: { id: string; camp_id: string; full_name: string; paid_pesewas: number }) =>
  notifyStaff("cancellation", {
    title: "Registration cancelled",
    body: `${r.full_name} cancelled their registration.${r.paid_pesewas > 0 ? ` They had paid ${formatCedis(r.paid_pesewas)}, so a refund request is waiting.` : ""}`,
    url: people(r.camp_id, r.id),
  });

export const requestAnswered = (registrationId: string, slug: string, text: string) =>
  notifyAttendee(registrationId, "request_answered", { title: "Your request was answered", body: text, url: `/camps/${slug}/me` });

export const roomReady = (registrationId: string, slug: string, campName: string, label: string, type: string) =>
  notifyAttendee(registrationId, "room_ready", {
    title: "Your room is ready",
    body: `You're in ${label} (${type}) at ${campName}.`,
    url: `/camps/${slug}/me/room`,
  });
