import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCedis } from "@/lib/camp/money";
import type { FellowshipRow } from "@/lib/camp/reports";
import { GROUPS } from "@/lib/fellowships";
import { Legend, StackedBar, statusParts, type BarPart } from "@/components/camp/ui";

/**
 * The rankings shared by People › Fellowships and the Pastor's report:
 * the money card, groups ranked, and fellowships ranked. Cancelled
 * registrations are never counted.
 */

export type Totals = Pick<FellowshipRow, "registered" | "partially_paid" | "fully_paid" | "expected" | "paid">;

export const active = (f: Pick<Totals, "registered" | "partially_paid" | "fully_paid">) => f.registered + f.partially_paid + f.fully_paid;
export const cedis = (p: number) => formatCedis(p).replace(/\.00$/, "");
const bar = (t: Totals) => statusParts({ fully_paid: t.fully_paid, partially_paid: t.partially_paid, registered: t.registered }, false);

export const sum = (rows: Totals[]): Totals =>
  rows.reduce(
    (t, f) => ({
      registered: t.registered + f.registered,
      partially_paid: t.partially_paid + f.partially_paid,
      fully_paid: t.fully_paid + f.fully_paid,
      expected: t.expected + f.expected,
      paid: t.paid + f.paid,
    }),
    { registered: 0, partially_paid: 0, fully_paid: 0, expected: 0, paid: 0 },
  );

/** The groups ranked, by registrations then fully paid. Children's Church has no group, so it stands alone. */
export function rankGroups(ranked: FellowshipRow[]) {
  return [...GROUPS, null]
    .map((g) => ({ name: g ?? "Children's Church", t: sum(ranked.filter((f) => f.group === g)) }))
    .filter((g) => active(g.t) > 0)
    .sort((a, b) => active(b.t) - active(a.t) || b.t.fully_paid - a.t.fully_paid);
}

/** Paid against what is left to pay, in cedis, with how many are fully, part and not paid. */
export function MoneyCard({ all, label = "paid" }: { all: Totals; label?: string }) {
  const owed = Math.max(0, all.expected - all.paid);
  const parts: BarPart[] = [
    { key: "paid", value: all.paid, color: "bg-st-paid", label: "Paid" },
    { key: "left", value: owed, color: "bg-stone-border", label: "Left to pay" },
  ];
  return (
    <section aria-label="Money" className="flex flex-col gap-3.5 rounded-2xl bg-white p-5 shadow-seline-hero">
      <p className="text-[17px] leading-snug">
        <strong className="font-display text-[40px] font-normal leading-none tracking-[-0.03em] tabular-nums">{cedis(all.paid)}</strong>
        <span className="text-warm-gray"> of {cedis(all.expected)}</span> {label}
      </p>
      <StackedBar parts={parts} className="h-2" />
      <Legend parts={parts} format={cedis} />
      <Legend parts={bar(all)} />
    </section>
  );
}

const listClass = (bare: boolean) => (bare ? "-mx-4 -mt-1" : "overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card");

/** `bare`: inside a card already (no second border). */
export function GroupRanking({ groups, bare = false }: { groups: ReturnType<typeof rankGroups>; bare?: boolean }) {
  return (
    <ol className={listClass(bare)}>
      {groups.map((g, i) => (
        <li key={g.name} className="flex min-h-[56px] flex-col justify-center gap-1.5 border-t border-stone-border px-4 py-2.5 first:border-t-0">
          <span className="flex items-baseline gap-3.5">
            <span className="w-6 flex-none text-right text-[13px] tabular-nums text-warm-gray">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{g.name}</span>
            <span className="flex-none text-[15px] tabular-nums">{active(g.t)}</span>
          </span>
          <span className="flex items-center gap-3.5 pl-[38px]">
            <StackedBar className="h-1.5 flex-1" parts={bar(g.t)} />
            <span className="flex-none text-[13px] tabular-nums text-warm-gray">
              {cedis(g.t.paid)} paid · {cedis(Math.max(0, g.t.expected - g.t.paid))} left to pay
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Each fellowship ranked. `href`: where tapping one goes (its people), or nothing on a read-only report. */
export function FellowshipRanking({ ranked, href, showGroup = false, bare = false }: { ranked: FellowshipRow[]; href?: (name: string) => string; showGroup?: boolean; bare?: boolean }) {
  const everyone = active(sum(ranked));
  const top = ranked[0] ? active(ranked[0]) : 0;
  return (
    <ol className={listClass(bare)}>
      {ranked.map((f, i) => {
        const n = active(f);
        const body = (
          <>
            <span className="w-6 flex-none text-right text-[13px] tabular-nums text-warm-gray">{i + 1}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[15px] font-medium">
                  {f.name}
                  {showGroup && f.group && <span className="font-normal text-warm-gray"> · {f.group}</span>}
                </span>
                <span className="flex-none text-[15px] tabular-nums">
                  {n}
                  <span className="text-[13px] text-warm-gray"> · {everyone ? Math.round((n / everyone) * 100) : 0}%</span>
                </span>
              </span>
              {/* Bar length is relative to the top fellowship, so the ranking reads at a glance. */}
              <span className="block" style={{ width: `${Math.max(4, top ? (n / top) * 100 : 0)}%` }}>
                <StackedBar className="h-1.5" parts={bar(f)} />
              </span>
              <span className="truncate text-[13px] text-warm-gray">
                {cedis(f.paid)} of {cedis(f.expected)} paid
                {[f.fully_paid && ` · ${f.fully_paid} fully paid`, f.partially_paid && ` · ${f.partially_paid} part paid`, f.registered && ` · ${f.registered} nothing paid`]
                  .filter(Boolean)
                  .join("")}
              </span>
            </span>
          </>
        );
        return (
          <li key={f.name} className="border-t border-stone-border first:border-t-0">
            {href ? (
              <Link href={href(f.name)} className="cm-row flex min-h-[64px] items-center gap-3.5 px-4 py-2.5">
                {body}
                <ChevronRight className="h-4 w-4 flex-none text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
              </Link>
            ) : (
              <div className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
