import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId, getCamp } from "./camps";
import { complaintReceived, complaintResolved } from "./notify";
import { getRegistration } from "./registrations";
import { inScope, scopeSql, type Scope } from "./scope";
import { CampError, type Registration } from "./types";

/**
 * Complaints: an attendee reports a problem (words, and one small photo if
 * they like). The coordinators and the leaders of their fellowship, group and
 * PFCC are told in the app (never a text). A coordinator marks it resolved and
 * the person is thanked in the app. Everything has a time.
 */

export type Complaint = {
  id: string;
  created_at: string;
  registration_id: string;
  full_name: string;
  fellowship: string;
  pfcc: string;
  phone: string;
  body: string;
  photo_url: string;
  status: "open" | "resolved";
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string;
};

export { MAX_COMPLAINT } from "./complaints-shared";
import { MAX_COMPLAINT } from "./complaints-shared";
const PER_HOUR = 5;

const SELECT = `SELECT c.id, c.created_at, c.registration_id, r.full_name, r.fellowship, r.pfcc, r.phone, c.body, c.photo_url, c.status, c.resolved_at, c.resolved_by, c.resolution_note
  FROM camp_complaints c JOIN camp_registrations r ON r.id = c.registration_id`;

export async function createComplaint(me: Registration, rawBody: string, photoUrl = "") {
  const body = String(rawBody ?? "").trim();
  if (body.length < 3) throw new CampError("Tell us what the problem is.");
  if (body.length > MAX_COMPLAINT) throw new CampError(`Keep it to ${MAX_COMPLAINT} characters.`);
  if (me.status === "cancelled") throw new CampError("This registration is cancelled.");
  const [recent] = await query<{ n: number }>("app", "SELECT COUNT(*) AS n FROM camp_complaints WHERE registration_id = ? AND created_at > ?", [me.id, new Date(Date.now() - 3_600_000).toISOString()]);
  if ((recent?.n ?? 0) >= PER_HOUR) throw new CampError("You've sent a few already. Please wait a little before sending another.");
  const id = crypto.randomUUID();
  await batch("app", [
    { sql: "INSERT INTO camp_complaints (id, camp_id, registration_id, body, photo_url) VALUES (?, ?, ?, ?, ?)", params: [id, me.camp_id, me.id, body, photoUrl] },
    auditStatement({ actor: `attendee:${me.id}`, campId: me.camp_id, action: "complaint.create", entity: "complaint", entityId: id, after: { note: body.slice(0, 100), photo: Boolean(photoUrl) } }),
  ]);
  await complaintReceived({ id, camp_id: me.camp_id, registration_id: me.id, full_name: me.full_name, fellowship: me.fellowship, body, photo: Boolean(photoUrl) });
  return id;
}

/** Newest first. Leaders see only their own people's. */
export function listComplaints(campId: string, scope: Scope = { kind: "all" }, status?: "open" | "resolved") {
  const s = scopeSql(scope);
  return query<Complaint>(
    "app",
    `${SELECT} WHERE c.camp_id = ?${s.sql}${status ? " AND c.status = ?" : ""} ORDER BY c.created_at DESC LIMIT 300`,
    [checkId(campId, "camp"), ...s.params, ...(status ? [status] : [])],
  );
}

export function listMyComplaints(registrationId: string) {
  return query<Complaint>("app", `${SELECT} WHERE c.registration_id = ? ORDER BY c.created_at DESC LIMIT 50`, [checkId(registrationId, "registration")]);
}

export async function openComplaintCount(campId: string, scope: Scope = { kind: "all" }) {
  const s = scopeSql(scope);
  const [row] = await query<{ n: number }>(
    "app",
    `SELECT COUNT(*) AS n FROM camp_complaints c JOIN camp_registrations r ON r.id = c.registration_id WHERE c.camp_id = ? AND c.status = 'open'${s.sql}`,
    [checkId(campId, "camp"), ...s.params],
  );
  return row?.n ?? 0;
}

/** A coordinator (or the leader of their own people) marks it resolved; the person is thanked in the app. Once only. */
export async function resolveComplaint(actor: string, id: string, note = "", scope: Scope = { kind: "all" }) {
  const [c] = await query<Complaint & { camp_id: string }>("app", `${SELECT.replace("SELECT c.id,", "SELECT c.camp_id, c.id,")} WHERE c.id = ?`, [checkId(id, "complaint")]);
  if (!c || !inScope(c, scope)) throw new CampError("Unknown complaint.");
  const text = String(note ?? "").trim().slice(0, 500);
  const results = await batch("app", [
    {
      sql: "UPDATE camp_complaints SET status = 'resolved', resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), resolved_by = ?, resolution_note = ? WHERE id = ? AND status = 'open' RETURNING id",
      params: [actor, text, c.id],
    },
    auditStatement({ actor, campId: c.camp_id, action: "complaint.resolve", entity: "complaint", entityId: c.id, after: { note: text || undefined }, ifChanged: true }),
  ]);
  if (!results[0].results.length) throw new CampError("That one is already resolved.");
  const reg = await getRegistration(c.registration_id);
  const camp = await getCamp(c.camp_id);
  if (reg && camp) await complaintResolved({ registration_id: reg.id, slug: camp.slug, full_name: reg.full_name });
}
