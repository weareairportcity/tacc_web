import { parseAdminEmails } from "@/lib/camp/roles";
import { listStaff } from "@/lib/camp/staff";
import { leaderScopes, listLeaderCodes } from "@/lib/camp/leaders";
import { AdminPage } from "@/components/camp/AdminPage";
import { ToastProvider } from "@/components/camp/toast";
import { titleClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../access";
import { LeaderCodes } from "./LeaderCodes";
import { StaffList } from "./StaffList";

export default async function CampStaffPage() {
  const me = await pageStaff("admin");
  if (!me) return <NoAccess />;
  const [staff, codes] = await Promise.all([listStaff(), listLeaderCodes()]);
  const bootstrap = parseAdminEmails(process.env.CAMP_ADMIN_EMAILS ?? "");

  return (
    <AdminPage
      email={me.email}
      tab="staff"
      title={
        <>
          Camp <span className="text-cyan-edge">staff</span>
        </>
      }
      lead="Coordinators run camps. Leaders get a read-only view of one fellowship or PFCC."
    >
      <StaffList staff={staff} me={me.email} bootstrap={bootstrap} />
      <section className="flex flex-col gap-3 pt-4">
        <h2 className={titleClass}>Leader codes</h2>
        <p className="text-sm text-warm-gray">Leaders sign in at commune.theairportcitychurch.com/leaders with their code. They see and scan their own people only.</p>
        <ToastProvider>
          <LeaderCodes scopes={leaderScopes()} codes={codes} />
        </ToastProvider>
      </section>
    </AdminPage>
  );
}
