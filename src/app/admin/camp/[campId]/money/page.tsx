import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { reconcileWithPaystack } from "@/lib/camp/reconciliation";
import { listFlaggedPayments } from "@/lib/camp/registrations";
import { listBulkPayments } from "@/lib/camp/reports";
import { formatDate, headlineClass, titleClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";

const FLAG_WORDS: Record<string, string> = {
  amount_mismatch: "paid the wrong amount",
  over_balance: "paid after their balance was covered",
};

/** Money: does it match Paystack, what needs a look, and what coordinators paid for people. */
export default async function MoneyPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();

  const [report, flagged, bulks] = await Promise.all([
    // Only Commune's own sentences are shown as they are; anything else is a plain "couldn't reach".
    reconcileWithPaystack(camp.id).catch((err) => ({
      error: err instanceof Error && /^[A-Z].*[.!?]$/.test(err.message) ? err.message : "Couldn't reach Paystack to check. Try again in a minute.",
    })),
    listFlaggedPayments(camp.id),
    listBulkPayments(camp.id),
  ]);
  const base = `/admin/camp/${camp.id}`;
  const checkedAt = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={`${headlineClass} text-[34px]`}>Money</h1>
        <a href={`${base}/registrations/export`} className="cm-press inline-flex h-10 items-center rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
          Download payments
        </a>
      </header>

      {"error" in report ? (
        <p className="flex items-start gap-2 rounded-[10px] border border-stone-border bg-white p-5 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.7} aria-hidden="true" />
          {report.error}
        </p>
      ) : (
        <section role="status" className="cm-rise flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5 shadow-seline-hero">
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="flex-none">
            <circle className="cm-ring" pathLength={1} cx="22" cy="22" r="20" fill="none" stroke={report.problems.length ? "#1c1917" : "#0ca30c"} strokeWidth="2.5" transform="rotate(-90 22 22)" />
            {report.problems.length ? (
              <g className="cm-drop">
                <path d="M22 13v11" stroke="#1c1917" strokeWidth="2.8" strokeLinecap="round" />
                <circle cx="22" cy="30" r="1.8" fill="#1c1917" />
              </g>
            ) : (
              <path className="cm-tick" pathLength={1} d="M13 22.5l6 6 12-13" fill="none" stroke="#0ca30c" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className={`${titleClass} text-[22px]`}>
              {report.problems.length ? `${report.problems.length} don't match Paystack` : "Matches Paystack"}
            </span>
            <span className="text-[13px] text-warm-gray">
              Checked {checkedAt} · {report.checked} payments
              {report.awaitingRefund > 0 && ` · ${report.awaitingRefund} waiting for a refund`}
              {!report.complete && " · Paystack had more than we read"}
            </span>
          </span>
          <Link href={`${base}/money`} prefetch={false} className="cm-press inline-flex h-10 items-center gap-2 rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
            <RefreshCw className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Check again
          </Link>
        </section>
      )}

      {"problems" in report && report.problems.length > 0 && (
        <Section title="Doesn't match">
          {report.problems.map((p) => (
            <li key={p.reference} className="flex flex-col gap-0.5 border-t border-stone-border px-4 py-3 text-sm first:border-t-0">
              <span className="font-medium">{p.full_name ?? p.reference}</span>
              <span className="text-[13px] text-warm-gray">
                {p.issue} Commune: {p.ours}. Paystack: {p.paystack}.
              </span>
            </li>
          ))}
        </Section>
      )}

      {flagged.length > 0 && (
        <Section title={`To look at · ${flagged.length}`}>
          {flagged.map((p) => (
            <li key={p.id} className="border-t border-stone-border first:border-t-0">
              <Link href={`${base}/people?person=${p.registration_id}`} className="cm-row flex min-h-[52px] items-center gap-3 px-4 py-2.5 text-sm">
                <AlertTriangle className="h-[18px] w-[18px] flex-none" strokeWidth={1.6} aria-hidden="true" />
                <span className="flex-1">
                  <strong className="font-medium">{p.full_name}</strong> {FLAG_WORDS[p.flag ?? ""] ?? p.flag} · {formatCedis(p.charged_pesewas)}
                </span>
                <ChevronRight className="h-4 w-4 text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </Section>
      )}

      <Section title="Paid by coordinators">
        {bulks.length === 0 && <li className="px-4 py-3.5 text-sm text-warm-gray">None yet. Select people on People, then Pay for them.</li>}
        {bulks.map((b) => (
          <li key={b.id} className="border-t border-stone-border first:border-t-0">
            <Link href={`/admin/camp/${camp.id}/money/paid?reference=${encodeURIComponent(b.reference)}`} className="cm-row flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <span className="w-28 text-warm-gray">{formatDate((b.paid_at ?? b.created_at).slice(0, 10))}</span>
            <span className="min-w-0 flex-1">
              <strong className="font-medium">{b.paid_by.split("@")[0]}</strong> for {b.count} {b.count === 1 ? "person" : "people"}
              {b.note && <span className="text-warm-gray"> · {b.note}</span>}
              <span className="block truncate text-[13px] text-warm-gray">{b.people}</span>
            </span>
            <span className="tabular-nums">
              {formatCedis(b.charged_pesewas)}
              {b.status === "pending" && <span className="text-warm-gray"> · processing</span>}
            </span>
            <ChevronRight className="h-4 w-4 text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">{children}</ul>
    </section>
  );
}
