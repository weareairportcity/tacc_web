import { currentStaff } from "@/lib/camp/auth";
import { assertRole } from "@/lib/camp/roles";
import type { Staff, StaffRole } from "@/lib/camp/types";

/**
 * Page-level role check. The proxy already sends signed-out visitors to
 * /admin/login; this decides what a signed-in one may see. Actions repeat
 * the check themselves.
 */
export async function pageStaff(...allowed: StaffRole[]): Promise<Staff | null> {
  try {
    return assertRole(await currentStaff(), allowed);
  } catch {
    return null;
  }
}

export function NoAccess() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold">No access</h1>
      <p className="mt-2 text-sm text-slate-500">
        Your account isn&apos;t set up for camp admin. Ask a camp admin to add your email.
      </p>
    </div>
  );
}
