import { CampError, type Staff, type StaffRole } from "./types";

/** CAMP_ADMIN_EMAILS: comma-separated, any case. */
export function parseAdminEmails(list: string): string[] {
  return list
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Who a signed-in email is, for camps. Emails in CAMP_ADMIN_EMAILS are always
 * admins, so the first admin can sign in before camp_staff has any rows.
 */
export function resolveStaff(email: string, row: Staff | null, bootstrapAdmins: string): Staff | null {
  const normalized = email.trim().toLowerCase();
  if (parseAdminEmails(bootstrapAdmins).includes(normalized)) {
    return { email: normalized, role: "admin", scope_kind: null, scope_value: null };
  }
  return row;
}

/** Admins can do everything a coordinator can. */
export function assertRole(staff: Staff | null, allowed: StaffRole[]): Staff {
  if (!staff) throw new CampError("You don't have access to camp admin.");
  if (allowed.includes(staff.role) || (staff.role === "admin" && allowed.includes("coordinator"))) {
    return staff;
  }
  throw new CampError("You don't have permission to do that.");
}
