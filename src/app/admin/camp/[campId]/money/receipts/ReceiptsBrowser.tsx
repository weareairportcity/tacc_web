"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Download, FileSpreadsheet } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { ReceiptCard, type ReceiptCamp, type ReceiptView } from "@/components/camp/ReceiptCard";
import { Sheet } from "@/components/camp/sheet";
import { primaryButtonClass, secondaryButtonClass } from "@/components/camp/ui";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { formatCedis } from "@/lib/camp/money";
import { downloadReceiptsPdf } from "@/lib/camp/receipt-pdf";
import type { ReceiptRow } from "@/lib/camp/receipts";
import { cn } from "@/lib/utils";

const METHOD: Record<string, string> = { momo: "Mobile money", card: "Card" };
const WHO: Record<ReceiptRow["who"], string> = { self: "Themselves", link: "Pay link", staff: "Coordinator or leader" };
const short = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

const view = (r: ReceiptRow): ReceiptView => ({
  reference: r.reference,
  paid_at: r.paid_at,
  full_name: r.full_name,
  room_type_name: r.room_type_name,
  payer: r.who === "self" ? null : r.payer,
  bulk: r.who === "staff",
  method: r.method,
  amount_pesewas: r.amount_pesewas,
  fee_pesewas: r.fee_pesewas,
  charged_pesewas: r.charged_pesewas,
  price_pesewas: r.price_pesewas,
  paid_pesewas: r.paid_pesewas,
  transaction_id: r.transaction_id,
});

/**
 * The list of receipts. Tap one to see it right here (and step through the
 * others); download it, or all of the list, as PDF. The spreadsheet is for
 * accounts.
 */
export function ReceiptsBrowser({ rows, camp, csvHref, filtered }: { rows: ReceiptRow[]; camp: ReceiptCamp & { slug: string }; csvHref: string; filtered: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyAll, startAll] = useOneAtATime();
  const [busyOne, startOne] = useOneAtATime();
  const current = open === null ? null : rows[open];
  const day = new Date().toISOString().slice(0, 10);

  const downloadOne = (r: ReceiptRow) => startOne(() => downloadReceiptsPdf([view(r)], camp, `receipt-${r.reference}.pdf`));
  const downloadAll = () => startAll(() => downloadReceiptsPdf(rows.map(view), camp, `${camp.slug}-receipts-${day}.pdf`));
  const copy = async (r: ReceiptRow) => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/camps/r/${r.reference}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={downloadAll} disabled={busyAll || !rows.length} aria-busy={busyAll} className={`${primaryButtonClass} h-11 gap-2 px-5`}>
          <Busy pending={busyAll} text={`Making ${rows.length} receipts…`}>
            <Download className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
            Download {filtered ? "these" : "all"} as PDF ({rows.length})
          </Busy>
        </button>
        <a href={csvHref} className={`${secondaryButtonClass} h-11 gap-2 px-4`}>
          <FileSpreadsheet className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Spreadsheet (CSV)
        </a>
      </div>

      {/* Wide screens: a table to scan and compare. Each row opens its receipt. */}
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
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.reference} onClick={() => setOpen(i)} className="cm-row cursor-pointer border-t border-stone-border first:border-t-0">
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-warm-gray">{short(r.paid_at)}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => setOpen(i)} className="text-left font-medium hover:underline">
                    {r.full_name}
                  </button>
                  <span className="block text-[13px] text-warm-gray">{r.room_type_name}</span>
                </td>
                <td className="px-4 py-3">
                  {r.payer}
                  {r.who !== "self" && <span className="block text-[13px] text-warm-gray">{WHO[r.who]}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {formatCedis(r.amount_pesewas)}
                  {r.fee_pesewas > 0 && <span className="block text-[13px] text-warm-gray">+ {formatCedis(r.fee_pesewas)} fee</span>}
                </td>
                <td className="px-4 py-3">{r.method ? (METHOD[r.method] ?? r.method) : "—"}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{r.reference}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadOne(r);
                    }}
                    aria-label={`Download receipt for ${r.full_name} as PDF`}
                    className="cm-press inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-border bg-white"
                  >
                    <Download className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: one card per receipt, the name and amount first. */}
      <ul className="flex flex-col overflow-hidden rounded-[14px] border border-stone-border bg-white shadow-seline-card md:hidden">
        {rows.map((r, i) => (
          <li key={r.reference} className="border-t border-stone-border first:border-t-0">
            <button type="button" onClick={() => setOpen(i)} className="cm-row flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-medium">{r.full_name}</span>
                <span className="truncate text-[13px] text-warm-gray">
                  {short(r.paid_at)} · {r.who === "self" ? "Paid themselves" : `By ${r.payer}`}
                </span>
              </span>
              <span className="text-[15px] tabular-nums">{formatCedis(r.amount_pesewas)}</span>
              <ChevronRight className="h-4 w-4 flex-none text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <Sheet
        open={current !== null}
        onClose={() => setOpen(null)}
        title={current ? current.full_name : "Receipt"}
        subtitle={open !== null ? `Receipt ${open + 1} of ${rows.length}` : undefined}
        footer={
          current && (
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => downloadOne(current)} disabled={busyOne} aria-busy={busyOne} className={`${primaryButtonClass} h-12 w-full gap-2`}>
                <Busy pending={busyOne} text="Making the PDF…">
                  <Download className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Download PDF
                </Busy>
              </button>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" disabled={open === 0} onClick={() => setOpen((i) => (i === null ? i : i - 1))} className={cn(secondaryButtonClass, "h-11 gap-1 px-2 disabled:opacity-40")}>
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Previous
                </button>
                <button type="button" onClick={() => copy(current)} className={cn(secondaryButtonClass, "h-11 gap-1.5 px-2")} aria-live="polite">
                  {copied ? <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> : <Copy className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />}
                  {copied ? "Copied" : "Copy link"}
                </button>
                <button
                  type="button"
                  disabled={open === rows.length - 1}
                  onClick={() => setOpen((i) => (i === null ? i : i + 1))}
                  className={cn(secondaryButtonClass, "h-11 gap-1 px-2 disabled:opacity-40")}
                >
                  Next <ChevronRight className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        }
      >
        {current && (
          <div className="bg-stone-canvas -mx-5 -my-1 px-3 py-3 sm:mx-0 sm:rounded-[24px]">
            <ReceiptCard r={view(current)} camp={camp} />
          </div>
        )}
      </Sheet>
    </>
  );
}
