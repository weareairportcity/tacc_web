import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { query } from "@/lib/cf";
import { currentLeader } from "./leaders";
import { assertRole, resolveStaff } from "./roles";
import type { Staff, StaffRole } from "./types";

/**
 * Camp staff access. Supabase Auth says who is signed in; camp_staff (D1)
 * says what they may do. Leaders can instead sign in with a code
 * (leaders.ts), which makes them a leader scoped to their fellowship or PFCC.
 * The two sides are separate addresses (/admin/camp and /leaders; the proxy
 * marks each request with its side) and only that side's sign-in counts, so
 * one device can be signed in to both without either taking over the other.
 * Call requireCampRole at the top of every camp server action and page: a
 * page check doesn't protect its actions.
 */

export async function currentStaff(): Promise<Staff | null> {
  if (await onLeadersSide()) return currentLeader();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const email = user.email.toLowerCase();
  const [row] = await query<Staff>(
    "app",
    "SELECT email, role, scope_kind, scope_value FROM camp_staff WHERE email = ?",
    [email],
  );
  return resolveStaff(email, row ?? null, process.env.CAMP_ADMIN_EMAILS ?? "");
}

/** True on commune…/leaders. Set by the proxy on every request, so it can't be chosen by the visitor. */
export async function onLeadersSide() {
  return (await headers()).get("x-commune-area") === "leader";
}

export async function requireCampRole(...allowed: StaffRole[]): Promise<Staff> {
  return assertRole(await currentStaff(), allowed);
}
