import { notFound } from "next/navigation";
import { getCamp, ID } from "@/lib/camp/camps";
import { listHealth } from "@/lib/camp/profile";
import { NoAccess, pageStaff } from "../../access";
import { HealthLists } from "./HealthLists";

/** Coordinators: who has added an emergency contact and health details, and who hasn't. */
export default async function HealthPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();
  const { added, missing } = await listHealth(camp.id);
  return <HealthLists campId={camp.id} added={added} missing={missing} />;
}
