import { notFound } from "next/navigation";
import { getCamp, ID } from "@/lib/camp/camps";
import { listComplaints } from "@/lib/camp/complaints";
import { scopeFor } from "@/lib/camp/reports";
import { headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { ComplaintsList } from "./ComplaintsList";

/**
 * Complaints: everything people have reported, newest first, with when it came
 * in and when it was resolved. Coordinators see them all; a leader sees their
 * own people's. Tap one to read it, see the photo and mark it resolved.
 */
export default async function ComplaintsPage({ params, searchParams }: { params: Promise<{ campId: string }>; searchParams: Promise<{ c?: string }> }) {
  const staff = await pageStaff("coordinator", "leader");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();
  const leader = staff.role === "leader";
  if (leader && camp.status === "draft") notFound();
  const { c } = await searchParams;
  const rows = await listComplaints(camp.id, scopeFor(staff));
  return (
    <div className="flex flex-col gap-5">
      <h1 className={`${headlineClass} text-[34px]`}>Complaints</h1>
      <ComplaintsList campId={camp.id} rows={rows} start={c ?? null} leader={leader} />
    </div>
  );
}
