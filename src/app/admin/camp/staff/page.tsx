import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { parseAdminEmails } from "@/lib/camp/roles";
import { listStaff } from "@/lib/camp/staff";
import { NoAccess, pageStaff } from "../access";
import { StaffList } from "./StaffList";

export default async function CampStaffPage() {
  const me = await pageStaff("admin");
  if (!me) return <NoAccess />;
  const staff = await listStaff();
  const bootstrap = parseAdminEmails(process.env.CAMP_ADMIN_EMAILS ?? "");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/camp" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Camps
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Camp staff</h1>
        <p className="mt-1 text-sm text-slate-500">
          Coordinators run camps. Leaders get a read-only view of one fellowship or PFCC (coming in a later phase).
        </p>
      </div>
      <StaffList staff={staff} me={me.email} bootstrap={bootstrap} />
    </div>
  );
}
