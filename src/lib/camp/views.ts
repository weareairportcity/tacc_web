import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { CampError } from "./types";

/** Saved People views: a name and the filters' query string, per coordinator. */

export type SavedView = { id: string; name: string; query: string };

export function listViews(campId: string, email: string): Promise<SavedView[]> {
  return query<SavedView>("app", "SELECT id, name, query FROM camp_saved_views WHERE camp_id = ? AND staff_email = ? ORDER BY name", [
    checkId(campId, "camp"),
    email,
  ]);
}

export async function saveView(campId: string, email: string, rawName: string, rawQuery: string) {
  const name = String(rawName ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) throw new CampError("Give the view a name.");
  // Only the filters; never anything else from the URL.
  const params = new URLSearchParams(String(rawQuery ?? "").replace(/^\?/, ""));
  const kept = new URLSearchParams();
  for (const key of ["q", "status", "fellowship", "pfcc", "church", "gender", "room_type", "roommate", "room", "checkin", "sort"]) {
    const v = params.get(key);
    if (v) kept.set(key, v.slice(0, 80));
  }
  const id = crypto.randomUUID();
  await batch("app", [
    {
      sql: `INSERT INTO camp_saved_views (id, camp_id, staff_email, name, query) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (camp_id, staff_email, name) DO UPDATE SET query = excluded.query`,
      params: [id, checkId(campId, "camp"), email, name, kept.toString()],
    },
    auditStatement({ actor: email, campId, action: "view.save", entity: "view", entityId: id, after: { name } }),
  ]);
  return { name, query: kept.toString() };
}

export async function deleteView(email: string, id: string) {
  await batch("app", [
    { sql: "DELETE FROM camp_saved_views WHERE id = ? AND staff_email = ? RETURNING camp_id", params: [checkId(id, "view"), email] },
    auditStatement({ actor: email, campId: null, action: "view.delete", entity: "view", entityId: id, ifChanged: true }),
  ]);
}
