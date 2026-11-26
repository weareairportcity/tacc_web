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

/** registrationId: their leaders hear about it too (registrations and requests). */
export const notifyStaff = (kind: StaffKind, m: Message, registrationId?: string) => send({ to: "staff", kind, ...m, ...(registrationId ? { registration_id: registrationId } : {}) });

/** A coordinator's message to leader codes' phones (app only). Answers how many phones got it. */
export async function notifyLeaders(owners: string[], m: { title: string; body: string; url: string }) {
  if (!owners.length) return 0;
  try {
    return (await post<{ push: number }>("/v1/admin/camp/notify", { to: "leaders", kind: "messages", owners, ...m })).push;
  } catch (err) {
    console.error("notify leaders", err);
    return 0;
  }
}

/** App notification kinds that can go to many attendees at once. "messages": coordinators' messages and the thank-you. */
export type ManyKind = "room_ready" | "request_answered" | "messages" | "due_soon";
export type PushItem = { registration_id: string; kind: ManyKind; title: string; body: string; url: string; once?: string };

/**
 * App notifications to many attendees, each with its own words. Answers who
 * got it on at least one phone, so only the rest are texted. If the Worker
 * can't be reached, nobody counts as reached and everyone is texted as before.
 */
export async function pushMany(items: PushItem[]): Promise<{ delivered: Set<string>; skipped: Set<string> }> {
  const delivered = new Set<string>();
  const skipped = new Set<string>();
  for (let i = 0; i < items.length; i += 1000) {
    try {
      const r = await post<{ delivered: string[]; skipped: string[] }>("/v1/admin/camp/notify-many", { items: items.slice(i, i + 1000) });
      r.delivered.forEach((id) => delivered.add(id));
      r.skipped.forEach((id) => skipped.add(id));
    } catch (err) {
      console.error("notify many", err);
    }
  }
  return { delivered, skipped };
}
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
  }, r.id);
}

export const newRequest = (r: { id: string; camp_id: string; full_name: string; paid_pesewas: number; room_type_name: string }, what: { refund: number } | { room: string }, reason: string) =>
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
  }, r.id);

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


/** Someone changed fellowship: the leaders they've joined and the ones they've left are told. App only. */
export async function fellowshipMoved(r: { id: string; camp_id: string; full_name: string }, from: string, to: string) {
  await send({
    to: "leaders",
    kind: "moved",
    registration_id: r.id,
    from_fellowship: from,
    title: `${r.full_name} joined ${to}`,
    body: `${r.full_name} moved to ${to} from ${from}.`,
    left_title: `${r.full_name} left ${from}`,
    left_body: `${r.full_name} moved from ${from} to ${to}.`,
    url: `/leaders/${r.camp_id}/people?person=${r.id}`,
  });
}

/** A payment was moved to another person: both are told (text if they have a number, else the app), leaders and coordinators too. */
export async function paymentMoved(o: { from_id: string; to_id: string; reference: string; amount_pesewas: number; by: string; camp_id: string }) {
  await send({
    to: "moves",
    kind: "payment_moved",
    from_id: o.from_id,
    to_id: o.to_id,
    reference: o.reference,
    amount_pesewas: o.amount_pesewas,
    by: o.by,
    title: "A payment was moved",
    body: "A payment was moved to another person.",
    url: `/admin/camp/${o.camp_id}/people?person=${o.to_id}`,
  });
}
