import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Receipt, Search } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { listReceipts, parseReceiptFilters, receiptQuery, WHO_WORDS } from "@/lib/camp/receipts";
import { ReceiptsBrowser } from "./ReceiptsBrowser";
import { headlineClass, inputClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../../../access";

/**
 * Receipts: every payment that went through for this camp, newest first,
 * each opening right here as the same receipt the attendee got (ReceiptsBrowser).
 * Filters are a plain form, so the address can be bookmarked, and the downloads
 * (PDF or spreadsheet) are exactly what's shown.
 */
export default async function ReceiptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ campId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();

  const filters = parseReceiptFilters(await searchParams);
  const rows = await listReceipts(camp.id, filters);
  const base = `/admin/camp/${camp.id}/money`;
  const qs = receiptQuery(filters);
  const filtered = Boolean(qs);
  const total = rows.reduce((n, r) => n + r.amount_pesewas, 0);
  const fees = rows.reduce((n, r) => n + r.fee_pesewas, 0);

  return (
    <div className="flex flex-col gap-6">
      <Link href={base} className="cm-press -ml-1 inline-flex min-h-11 items-center gap-2 self-start text-[15px]">
        <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" /> Money
      </Link>

      <header className="-mt-3 flex flex-wrap items-end justify-between gap-3">
        <h1 className={`${headlineClass} text-[34px]`}>Receipts</h1>
      </header>

      {/* The three numbers people ask for first. */}
      <dl className="grid grid-cols-3 overflow-hidden rounded-[14px] border border-stone-border bg-white shadow-seline-card">
        {(
          [
            ["Receipts", String(rows.length)],
            ["Towards camp", formatCedis(total)],
            ["Fees paid by payers", formatCedis(fees)],
          ] as const
        ).map(([k, v], i) => (
          <div key={k} className={cn("flex flex-col gap-1 px-4 py-3.5", i > 0 && "border-l border-stone-border")}>
            <dt className="text-[12px] text-warm-gray sm:text-[13px]">{k}</dt>
            <dd className="font-display text-[20px] leading-tight tabular-nums sm:text-[24px]">{v}</dd>
          </div>
        ))}
      </dl>

      <form method="get" className="flex flex-col gap-3 rounded-[14px] border border-stone-border bg-white p-4 shadow-seline-card" role="search" aria-label="Filter receipts">
        <label className="relative flex">
          <span className="sr-only">Search by name or receipt number</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-gray" strokeWidth={1.7} aria-hidden="true" />
          <input name="q" defaultValue={filters.q} placeholder="Name, payer or receipt no." className={`${inputClass} pl-10`} />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Select name="method" label="Paid with" value={filters.method} options={[["", "Any way"], ["momo", "Mobile money"], ["card", "Card"]]} />
          <Select name="who" label="Who paid" value={filters.who} options={[["", "Anyone"], ["self", WHO_WORDS.self], ["link", WHO_WORDS.link], ["staff", WHO_WORDS.staff]]} />
          <DateField name="from" label="From" value={filters.from} />
          <DateField name="to" label="To" value={filters.to} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="cm-press h-10 rounded-full bg-soot px-5 text-sm font-medium text-white">
            Show
          </button>
          {filtered && (
            <Link href={`${base}/receipts`} className="cm-press inline-flex h-10 items-center rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="flex items-center gap-3 rounded-[14px] border border-stone-border bg-white px-4 py-5 text-[15px] text-warm-gray">
          <Receipt className="h-5 w-5 flex-none" strokeWidth={1.6} aria-hidden="true" />
          {filtered ? "No receipts match. Try fewer filters." : "No payments yet. Receipts appear here as soon as someone pays."}
        </p>
      ) : (
        <>
          <ReceiptsBrowser rows={rows} camp={camp} csvHref={`${base}/receipts/export${qs ? `?${qs}` : ""}`} filtered={filtered} />
          {rows.length >= 2000 && <p className="text-[13px] text-warm-gray">Showing the newest 2,000. Narrow the dates to see older ones.</p>}
        </>
      )}
    </div>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-[13px] font-medium">
      {label}
      <select name={name} defaultValue={value} className={`${inputClass} h-10 text-sm font-normal`}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateField({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="flex flex-col gap-1 text-[13px] font-medium">
      {label}
      <input type="date" name={name} defaultValue={value} className={`${inputClass} h-10 text-sm font-normal`} />
    </label>
  );
}
