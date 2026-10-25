import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { reconcileWithPaystack } from "@/lib/camp/reconciliation";
import { Card, headlineClass, primaryButtonClass } from "@/components/camp/ui";
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
  const checkedAt = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className={headlineClass}>
            Check against <span className="text-cyan-edge">Paystack</span>
          </h1>
          <p className="text-sm text-warm-gray">Every payment here compared with Paystack&apos;s own records, one by one.</p>
        </div>
        <Link href={`/admin/camp/${camp.id}/reconcile`} prefetch={false} className={primaryButtonClass}>
          <RefreshCw className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Run check again
        </Link>
      </header>

      {"error" in report ? (
        <p className="flex items-start gap-2 rounded-[10px] border border-stone-border bg-white p-5 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.7} aria-hidden="true" />
          {report.error}
        </p>
      ) : (
        <>
          <section role="status" className="cm-rise flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-seline-hero">
            <div className="flex items-center gap-3.5">
              <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
                <circle className="cm-ring" pathLength={1} cx="22" cy="22" r="20" fill="none" stroke="#1c1917" strokeWidth="2.5" transform="rotate(-90 22 22)" />
                {report.problems.length ? (
                  <g className="cm-drop">
                    <path d="M22 13v11" stroke="#1c1917" strokeWidth="2.8" strokeLinecap="round" />
                    <circle cx="22" cy="30" r="1.8" fill="#1c1917" />
                  </g>
                ) : (
                  <path className="cm-tick" pathLength={1} d="M13 22.5l6 6 12-13" fill="none" stroke="#1c1917" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
              <span className="flex flex-col gap-0.5">
                <span className="font-display text-[26px] leading-tight tracking-[-0.015em]">
                  {report.problems.length
                    ? `${report.problems.length} payment${report.problems.length === 1 ? " doesn't" : "s don't"} match`
                    : "The money matches"}
                </span>
                <span className="text-[13px] text-warm-gray">
                  Checked at {checkedAt} · {report.checked} payment{report.checked === 1 ? "" : "s"} compared
                </span>
              </span>
            </div>
            {report.awaitingRefund > 0 && (
              <p className="text-sm">
                {report.awaitingRefund} paid after their balance was covered and {report.awaitingRefund === 1 ? "is" : "are"} waiting for a
                refund. Refund in Paystack, then record it on the person&apos;s page.
              </p>
            )}
            {!report.complete && (
              <p className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.7} aria-hidden="true" />
                Paystack returned more transactions than this page reads, so the check may be incomplete.
              </p>
            )}
          </section>

          {report.problems.length > 0 && (
            <Card title="To look at">
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap text-sm">
                  <thead className="text-left text-xs text-warm-gray">
                    <tr>
                      <th className="pb-2.5 pr-3 font-medium">Reference</th>
                      <th className="px-3 pb-2.5 font-medium">Name</th>
                      <th className="px-3 pb-2.5 font-medium">Commune says</th>
                      <th className="px-3 pb-2.5 font-medium">Paystack says</th>
                      <th className="pb-2.5 pl-3 font-medium">What&apos;s wrong</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.problems.map((p) => (
                      <tr key={p.reference} className="border-t border-stone-border">
                        <td className="py-3 pr-3 font-mono text-xs">{p.reference}</td>
                        <td className="px-3 py-3">{p.full_name ?? ""}</td>
                        <td className="px-3 py-3">{p.ours}</td>
                        <td className="px-3 py-3">{p.paystack}</td>
                        <td className="whitespace-normal py-3 pl-3">{p.issue}</td>
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
