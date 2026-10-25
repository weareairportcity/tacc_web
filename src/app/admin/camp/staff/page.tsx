import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { parseAdminEmails } from "@/lib/camp/roles";
import { listStaff } from "@/lib/camp/staff";
import { AdminTopBar } from "@/components/camp/AdminTopBar";
import { headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../access";
import { StaffList } from "./StaffList";

export default async function CampStaffPage() {
  const me = await pageStaff("admin");
  if (!me) return <NoAccess />;
  const staff = await listStaff();
  const bootstrap = parseAdminEmails(process.env.CAMP_ADMIN_EMAILS ?? "");

  return (
    <>
      <AdminTopBar email={me.email} />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 pb-16 pt-4">
        <Link href="/admin/camp" className="-ml-1 inline-flex min-h-10 items-center gap-1 self-start text-sm">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Camps
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className={headlineClass}>
            Camp <span className="text-cyan-edge">staff</span>
          </h1>
          <p className="text-sm text-warm-gray">
            Coordinators run camps. Leaders get a read-only view of one fellowship or PFCC.
          </p>
        </div>
        <StaffList staff={staff} me={me.email} bootstrap={bootstrap} />
      </div>
    </>
  );
}
