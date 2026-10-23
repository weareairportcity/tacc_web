import { createClient } from "@/utils/supabase/server";
import { query } from "@/lib/cf";
import { assertRole, resolveStaff } from "./roles";
import type { Staff, StaffRole } from "./types";

/**
 * Camp staff access. Supabase Auth says who is signed in; camp_staff (D1)
 * says what they may do. Call requireCampRole at the top of every camp
 * server action and page: a page check doesn't protect its actions.
 */

export async function currentStaff(): Promise<Staff | null> {
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
