import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { reconcileWithPaystack } from "@/lib/camp/reconciliation";
import { Card } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";

/** Every camp payment against Paystack's own list. Read-only; reload to re-check. */
export default async function ReconcilePage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();

  let report;
  try {
    report = await reconcileWithPaystack(camp.id);
  } catch (err) {
    report = { error: err instanceof Error ? err.message : "Couldn't reach Paystack." };
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/camp/${camp.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {camp.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Check against Paystack</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every payment here compared with Paystack&apos;s own records, one by one. Reload the page to check again.
        </p>
      </div>

      {"error" in report ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{report.error}</p>
      ) : (
        <>
          <div
            className={`flex items-center gap-2 rounded-lg border p-4 text-sm ${
              report.problems.length ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {report.problems.length ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            {report.problems.length
              ? `${report.problems.length} payment(s) don't match.`
              : `Reconciles exactly: all ${report.checked} payment(s) match Paystack.`}
            {report.awaitingRefund > 0 && ` ${report.awaitingRefund} paid after the balance was covered, waiting for a refund.`}
          </div>
          {!report.complete && (
            <p className="text-sm text-amber-700">Paystack returned more transactions than this page reads; the check may be incomplete.</p>
          )}
          {report.problems.length > 0 && (
            <Card title="To look at">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Reference</th>
                      <th className="py-1 pr-3 font-medium">Name</th>
                      <th className="py-1 pr-3 font-medium">Here</th>
                      <th className="py-1 pr-3 font-medium">Paystack</th>
                      <th className="py-1 font-medium">Issue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.problems.map((p) => (
                      <tr key={p.reference}>
                        <td className="py-1 pr-3 font-mono text-xs">{p.reference}</td>
                        <td className="py-1 pr-3">{p.full_name ?? ""}</td>
                        <td className="py-1 pr-3">{p.ours}</td>
                        <td className="py-1 pr-3">{p.paystack}</td>
                        <td className="py-1">{p.issue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
