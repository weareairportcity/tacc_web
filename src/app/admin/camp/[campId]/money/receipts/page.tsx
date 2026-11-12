import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Receipt, Search } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { listReceipts, methodWords, parseReceiptFilters, receiptQuery, WHO_WORDS, type ReceiptRow } from "@/lib/camp/receipts";
import { headlineClass, inputClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../../../access";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

/**
 * Receipts: every payment that went through for this camp, newest first,
 * each opening the same receipt the attendee got. Filters are a plain form,
 * so the address can be bookmarked and Export downloads exactly what's shown.
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
        <a
          href={`${base}/receipts/export${qs ? `?${qs}` : ""}`}
          className="cm-press inline-flex h-10 items-center gap-2 rounded-full border border-stone-border bg-white px-4 text-sm font-medium"
        >
          <Download className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
          Export {filtered ? "these" : "all"} ({rows.length})
        </a>
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
          {/* Wide screens: a table to scan and compare. */}
          <div className="hidden overflow-x-auto rounded-[14px] border border-stone-border bg-white shadow-seline-card md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-border text-[13px] text-warm-gray">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  <th scope="col" className="px-4 py-3 font-medium">Attendee</th>
                  <th scope="col" className="px-4 py-3 font-medium">Paid by</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-4 py-3 font-medium">Paid with</th>
                  <th scope="col" className="px-4 py-3 font-medium">Receipt no.</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.reference} className="border-t border-stone-border first:border-t-0">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-warm-gray">{when(r.paid_at)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/camp/${camp.id}/people?person=${r.registration_id}`} className="font-medium hover:underline">
                        {r.full_name}
                      </Link>
                      <span className="block text-[13px] text-warm-gray">{r.room_type_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.payer}
                      {r.who !== "self" && <span className="block text-[13px] text-warm-gray">{WHO_WORDS[r.who]}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {formatCedis(r.amount_pesewas)}
                      {r.fee_pesewas > 0 && <span className="block text-[13px] text-warm-gray">+ {formatCedis(r.fee_pesewas)} fee</span>}
                    </td>
                    <td className="px-4 py-3">{methodWords(r.method) || "—"}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">{r.reference}</td>
                    <td className="px-4 py-3 text-right">
                      <OpenReceipt r={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per receipt, the amount and name first. */}
          <ul className="flex flex-col overflow-hidden rounded-[14px] border border-stone-border bg-white shadow-seline-card md:hidden">
            {rows.map((r) => (
              <li key={r.reference} className="border-t border-stone-border first:border-t-0">
                <a href={`/camps/r/${encodeURIComponent(r.reference)}`} target="_blank" rel="noopener" className="cm-row flex items-center gap-3 px-4 py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-medium">{r.full_name}</span>
                    <span className="truncate text-[13px] text-warm-gray">
                      {when(r.paid_at)} · {r.who === "self" ? "Paid themselves" : `By ${r.payer}`}
                      {r.method ? ` · ${methodWords(r.method)}` : ""}
                    </span>
                  </span>
                  <span className="text-[15px] tabular-nums">{formatCedis(r.amount_pesewas)}</span>
                  <ExternalLink className="h-4 w-4 flex-none text-ash-gray" strokeWidth={1.7} aria-label="Open receipt" />
                </a>
              </li>
            ))}
          </ul>
          {rows.length >= 2000 && <p className="text-[13px] text-warm-gray">Showing the newest 2,000. Narrow the dates to see older ones.</p>}
        </>
      )}
    </div>
  );
}

function OpenReceipt({ r }: { r: ReceiptRow }) {
  return (
    <a
      href={`/camps/r/${encodeURIComponent(r.reference)}`}
      target="_blank"
      rel="noopener"
      className="cm-press inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-border px-3 text-[13px] font-medium"
    >
      Receipt <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
      <span className="sr-only">for {r.full_name}</span>
    </a>
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
