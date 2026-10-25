import { CircleSlash } from "lucide-react";
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
    <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-[10px] border border-stone-border bg-white p-8 text-center">
      <CircleSlash className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
      <h1 className="font-display text-2xl">No access</h1>
      <p className="text-sm leading-relaxed text-warm-gray">
        Your account isn&apos;t set up for Commune. Ask a camp admin to add your email.
      </p>
    </div>
  );
}
