import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { actorName } from "@/lib/camp/history-words";
import { formatCedis } from "@/lib/camp/money";
import { listFlaggedPayments } from "@/lib/camp/registrations";
import { listBulkPayments } from "@/lib/camp/reports";
import { formatDate, headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { ExpressPayCheck } from "./ExpressPayCheck";

const FLAG_WORDS: Record<string, string> = {
  amount_mismatch: "paid the wrong amount",
  over_balance: "paid after their balance was covered",
  paystack_unchecked: "started a Paystack payment before the switch: check Paystack's dashboard",
};

/** Money: does it match expressPay, what needs a look, and what coordinators paid for people. */
export default async function MoneyPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();

  const [flagged, bulks] = await Promise.all([listFlaggedPayments(camp.id), listBulkPayments(camp.id)]);
  const base = `/admin/camp/${camp.id}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={`${headlineClass} text-[34px]`}>Money</h1>
        <a href={`${base}/registrations/export`} className="cm-press inline-flex h-10 items-center rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
          Download payments
        </a>
      </header>

      <ExpressPayCheck campId={camp.id} />

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

      <Section title="Paid by coordinators and leaders">
        {bulks.length === 0 && <li className="px-4 py-3.5 text-sm text-warm-gray">None yet. Select people on People, then Pay for them.</li>}
        {bulks.map((b) => (
          <li key={b.id} className="border-t border-stone-border first:border-t-0">
            <Link href={`/admin/camp/${camp.id}/money/paid?reference=${encodeURIComponent(b.reference)}`} className="cm-row flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <span className="w-28 text-warm-gray">{formatDate((b.paid_at ?? b.created_at).slice(0, 10))}</span>
            <span className="min-w-0 flex-1">
              <strong className="font-medium">{actorName(b.paid_by, null)}</strong> for {b.count} {b.count === 1 ? "person" : "people"}
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
