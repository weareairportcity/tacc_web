import { notFound } from "next/navigation";
import { ID } from "@/lib/camp/camps";
import { NoAccess, pageStaff } from "../../../access";
import { BulkPaid } from "./BulkPaid";

/** Where expressPay sends a coordinator or leader back after paying for several people (?order-id=…&token=…). */
export default async function BulkPaidPage({ params, searchParams }: { params: Promise<{ campId: string }>; searchParams: Promise<{ reference?: string; "order-id"?: string }> }) {
  const staff = await pageStaff("coordinator", "leader");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const q = await searchParams;
  const reference = String(q.reference ?? q["order-id"] ?? "");
  return <BulkPaid campId={campId} reference={reference} leader={staff.role === "leader"} />;
}
