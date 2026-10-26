import { notFound } from "next/navigation";
import { getCamp, ID } from "@/lib/camp/camps";
import { listRequests } from "@/lib/camp/requests";
import { NoAccess, pageStaff } from "../../access";
import { Requests } from "./Requests";

/** Refunds and room changes people asked for. A coordinator decides each one, case by case. */
export default async function RequestsPage({ params, searchParams }: { params: Promise<{ campId: string }>; searchParams: Promise<{ show?: string; r?: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const { show, r } = await searchParams;
  const done = show === "done";
  const [camp, requests] = await Promise.all([getCamp(campId), listRequests(campId, done ? "done" : "pending")]);
  if (!camp) notFound();
  return <Requests campId={camp.id} requests={requests} done={done} open={r ?? null} />;
}
