import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { listFlaggedPayments, listRegistrations, todayInGhana } from "@/lib/camp/registrations";
import { REGISTRATION_STATUS_LABELS } from "@/lib/camp/types";
import { Card, REGISTRATION_STATUS_STYLES } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { CancelButton } from "./CancelButton";

const FLAG_LABELS: Record<string, string> = {
  amount_mismatch: "Paystack amount didn't match",
  over_balance: "Paid after the balance was covered: refund in Paystack",
};

/** Minimal list for Phase 2; the full dashboard and filters come in Phase 5. */
export default async function RegistrationsPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();

  const [camp, registrations, flagged] = await Promise.all([
    getCamp(campId),
    listRegistrations(campId),
    listFlaggedPayments(campId),
  ]);
  if (!camp) notFound();
  const pastDue = todayInGhana() > camp.payment_due_on;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/camp/${camp.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {camp.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Registrations ({registrations.length})</h1>
        <p className="mt-1 text-sm text-slate-500">
          Public page: <span className="font-mono">/camps/{camp.slug}</span>
        </p>
      </div>

      {flagged.length > 0 && (
        <Card title={`Payments to look at (${flagged.length})`}>
          <ul className="space-y-2 text-sm">
            {flagged.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="font-medium">{p.full_name}</span>
                <span className="font-mono text-xs">{p.reference}</span>
                <span>{formatCedis(p.charged_pesewas)}</span>
                <span className="text-slate-500">{FLAG_LABELS[p.flag ?? ""] ?? p.flag}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Fellowship</th>
              <th className="px-4 py-2 font-medium">Room type</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Paid</th>
              <th className="px-4 py-2 text-right font-medium">Balance</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {registrations.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  No registrations yet.
                </td>
              </tr>
            )}
            {registrations.map((r) => {
              const balance = r.price_pesewas - r.paid_pesewas;
              const overdue = pastDue && balance > 0 && r.status !== "cancelled";
              return (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.full_name}</div>
                    <div className="text-xs text-slate-500">
                      {r.phone} · {r.gender}
                    </div>
                  </td>
                  <td className="px-4 py-2">{r.fellowship}</td>
                  <td className="px-4 py-2">{r.room_type_name}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REGISTRATION_STATUS_STYLES[r.status]}`}>
                      {REGISTRATION_STATUS_LABELS[r.status]}
                    </span>
                    {overdue && <span className="ml-2 text-xs font-medium text-red-600">Past due</span>}
                    {r.flagged > 0 && <AlertTriangle className="ml-2 inline h-4 w-4 text-amber-600" />}
                  </td>
                  <td className="px-4 py-2 text-right">{formatCedis(r.paid_pesewas)}</td>
                  <td className="px-4 py-2 text-right">{formatCedis(balance)}</td>
                  <td className="px-4 py-2 text-right">
                    {r.status !== "cancelled" && <CancelButton id={r.id} name={r.full_name} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
