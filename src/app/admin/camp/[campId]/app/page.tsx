import { notFound } from "next/navigation";
import { getCamp, ID } from "@/lib/camp/camps";
import { listAppPeople } from "@/lib/camp/broadcast";
import { listTeamApp } from "@/lib/camp/team-app";
import { NoAccess, pageStaff } from "../../access";
import { AppList } from "./AppList";

/** The app: who has Commune on their phone with notifications on, and who still gets texts. */
export default async function AppPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const [camp, people, team] = await Promise.all([getCamp(campId), listAppPeople(campId), listTeamApp()]);
  if (!camp) notFound();
  return <AppList campId={camp.id} required={camp.app_required !== 0} people={people} team={team} />;
}
