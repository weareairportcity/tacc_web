import { notFound } from "next/navigation";
import { query } from "@/lib/cf";
import { getCamp, ID } from "@/lib/camp/camps";
import { headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { PastorPay, type PayRow } from "./PastorPay";

/** Pay: the Pastor finds people, ticks them and pays their balance in one go. Each one is told "Pastor has paid for you". */
export default async function PayPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator", "pastor");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();
  const rows = await query<PayRow>(
    "app",
    `SELECT r.id, r.full_name, r.fellowship, r.status, r.price_pesewas AS price, r.paid_pesewas AS paid
     FROM camp_registrations r WHERE r.camp_id = ? AND r.status <> 'cancelled' ORDER BY r.full_name COLLATE NOCASE`,
    [camp.id],
  );
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1 className={`${headlineClass} text-[34px]`}>Pay</h1>
        <p className="text-[15px] text-warm-gray">
          Tick the people you&apos;d like to pay for, then pay what they still owe in one go. Each one gets a notification and a text saying Pastor has paid for them.
        </p>
      </header>
      <PastorPay campId={camp.id} rows={rows} />
    </div>
  );
}
