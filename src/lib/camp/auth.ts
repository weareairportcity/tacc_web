import { createClient } from "@/utils/supabase/server";
import { query } from "@/lib/cf";
import { currentLeader } from "./leaders";
import { assertRole, resolveStaff } from "./roles";
import type { Staff, StaffRole } from "./types";

/**
 * Camp staff access. Supabase Auth says who is signed in; camp_staff (D1)
 * says what they may do. Leaders can instead sign in with a code
 * (leaders.ts), which makes them a leader scoped to their fellowship or PFCC.
 * A leader session wins over a Supabase one on the same device: entering a
 * leader code is the most recent choice (the coordinator sign-in ends it).
 * Call requireCampRole at the top of every camp server action and page: a
 * page check doesn't protect its actions.
 */

export async function currentStaff(): Promise<Staff | null> {
  const leader = await currentLeader();
  if (leader) return leader;
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

export async function requireCampRole(...allowed: StaffRole[]): Promise<Staff> {
  return assertRole(await currentStaff(), allowed);
}
