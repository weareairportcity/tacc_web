import { notFound } from "next/navigation";
import { arrivalCounts, recentArrivals } from "@/lib/camp/checkin";
import { getCamp, ID } from "@/lib/camp/camps";
import { NoAccess, pageStaff } from "../../access";
import { CheckIn } from "./CheckIn";

/**
 * Check-in. The QR on an attendee's pass links here with a signed token, so a
 * phone's own camera app works too; on Android the page can scan by itself.
 */
export default async function CheckInPage({ params, searchParams }: { params: Promise<{ campId: string }>; searchParams: Promise<{ t?: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const [camp, counts, recent, { t }] = await Promise.all([getCamp(campId), arrivalCounts(campId), recentArrivals(campId), searchParams]);
  if (!camp) notFound();
  return <CheckIn campId={camp.id} counts={counts} recent={recent} token={t ?? null} />;
}
