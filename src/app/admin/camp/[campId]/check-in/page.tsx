import { notFound } from "next/navigation";
import { arrivalCounts, recentArrivals } from "@/lib/camp/checkin";
import { getCamp, ID } from "@/lib/camp/camps";
import { scopeFor } from "@/lib/camp/reports";
import { NoAccess, pageStaff } from "../../access";
import { CheckIn } from "./CheckIn";

/**
 * Scan: checking people in, and handing out T-shirts. The QR on an
 * attendee's pass links here with a signed token, so a phone's own camera
 * app works too; on Android the page can scan by itself. Leaders see and
 * scan their own fellowship or PFCC only.
 */
export default async function CheckInPage({ params, searchParams }: { params: Promise<{ campId: string }>; searchParams: Promise<{ mode?: string }> }) {
  const staff = await pageStaff("coordinator", "leader");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const scope = scopeFor(staff);
  // The pass token (?t=) is read in the browser, so the page also works from the phone's saved copy.
  const { mode } = await searchParams;
  const [camp, counts, recentIn, recentShirts] = await Promise.all([
    getCamp(campId),
    arrivalCounts(campId, scope),
    recentArrivals(campId, "checkin", scope),
    recentArrivals(campId, "shirt", scope),
  ]);
  if (!camp) notFound();
  return (
    <CheckIn
      campId={camp.id}
      counts={counts}
      recent={{ checkin: recentIn, shirt: recentShirts }}
      initialMode={mode === "shirt" ? "shirt" : null}
      leader={staff.role === "leader"}
      shirtPaidOnly={!!camp.shirt_paid_only}
    />
  );
}
