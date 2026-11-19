import { parseAdminEmails } from "@/lib/camp/roles";
import { listStaff } from "@/lib/camp/staff";
import { leaderGroups, leaderScopes, listLeaderCodes } from "@/lib/camp/leaders";
import { AdminPage } from "@/components/camp/AdminPage";
import { ToastProvider } from "@/components/camp/toast";
import { titleClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../access";
import { GroupLeaderCodes } from "./GroupLeaderCodes";
import { MedicalCode } from "./MedicalCode";
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
      lead="Coordinators run camps. Leaders look after one fellowship, PFCC or group."
    >
      <StaffList staff={staff} me={me.email} bootstrap={bootstrap} />
      <section className="flex flex-col gap-3 pt-4">
        <h2 className={titleClass}>Leader codes</h2>
        <p className="text-sm text-warm-gray">Leaders sign in at commune.theairportcitychurch.com/leaders with their code. They see and scan their own people only.</p>
        <ToastProvider>
          <LeaderCodes scopes={leaderScopes()} codes={codes} />
        </ToastProvider>
      </section>
      <section className="flex flex-col gap-3 pt-4">
        <h2 className={titleClass}>Group Leaders</h2>
        <p className="text-sm text-warm-gray">
          Groups sit between PFCC and fellowship. Each Group Leader gets their own code and signs in at the same address. They see, pay for and scan everyone in
          their group&apos;s fellowships, with the group&apos;s ranking and money.
        </p>
        <ToastProvider>
          <GroupLeaderCodes groups={leaderGroups()} codes={codes} />
        </ToastProvider>
      </section>
      <section className="flex flex-col gap-3 pt-4">
        <h2 className={titleClass}>Medical team</h2>
        <p className="text-sm text-warm-gray">
          One code for the whole medical team, at the same address. It opens a search of everyone: their health notes, emergency contact, room and roommates
          with phones. Nothing else. Their searches, the people they open and their calls are noted in the History.
        </p>
        <ToastProvider>
          <MedicalCode codes={codes} />
        </ToastProvider>
      </section>
    </AdminPage>
  );
}
