import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { getFellowshipBreakdown, scopeFor, type FellowshipRow } from "@/lib/camp/reports";
import { GROUPS } from "@/lib/fellowships";
import { Legend, StackedBar, headlineClass, statusParts, type BarPart } from "@/components/camp/ui";
import { PeopleTabs } from "@/components/camp/PeopleTabs";
import { NoAccess, pageStaff } from "../../../access";

const active = (f: Pick<FellowshipRow, "registered" | "partially_paid" | "fully_paid">) => f.registered + f.partially_paid + f.fully_paid;
const cedis = (p: number) => formatCedis(p).replace(/\.00$/, "");

type Totals = Pick<FellowshipRow, "registered" | "partially_paid" | "fully_paid" | "expected" | "paid">;
const sum = (rows: Totals[]): Totals =>
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

/**
 * People › Fellowships: each fellowship ranked by how many have registered
 * (cancelled left out), with the money. Coordinators see every fellowship and
 * the groups ranked; a Group or PFCC leader sees their own fellowships.
 * Tap one to see its people.
 */
export default async function FellowshipsPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator", "leader");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();
  const leader = staff.role === "leader";
  if (leader && camp.status === "draft") notFound();
  const scope = scopeFor(staff);
  // A fellowship leader has one fellowship: nothing to rank.
  if (leader && scope.kind === "fellowship") redirect(`/leaders/${camp.id}/people`);

  const ranked = await getFellowshipBreakdown(camp.id, scope);
  const all = sum(ranked);
  const everyone = active(all);
  const top = ranked[0] ? active(ranked[0]) : 0;
  const home = leader ? "/leaders" : "/admin/camp";
  const people = `${home}/${camp.id}/people`;
  const owed = Math.max(0, all.expected - all.paid);
  const moneyParts: BarPart[] = [
    { key: "paid", value: all.paid, color: "bg-st-paid", label: "Paid" },
    { key: "owed", value: owed, color: "bg-stone-border", label: "Still owed" },
  ];
  // Coordinators: the groups ranked (Children's Church has no group, so it stands alone).
  const groups = leader
    ? []
    : [...GROUPS, null]
        .map((g) => ({ name: g ?? "No group", t: sum(ranked.filter((f) => f.group === g)) }))
        .filter((g) => active(g.t) > 0)
        .sort((a, b) => active(b.t) - active(a.t) || b.t.fully_paid - a.t.fully_paid);

  return (
    <div className="flex flex-col gap-5">
      <h1 className={`${headlineClass} text-[34px]`}>{leader && scope.kind !== "all" ? scope.value : "People"}</h1>
      <PeopleTabs base={people} current="fellowships" />
      <p className="text-[15px] text-warm-gray">
        {ranked.length} {ranked.length === 1 ? "fellowship" : "fellowships"} ranked by how many have registered. {everyone} {everyone === 1 ? "person" : "people"} in all;
        cancelled registrations aren&apos;t counted.
      </p>

      {ranked.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white p-6 text-center text-[15px] text-warm-gray">No registrations yet.</p>
      ) : (
        <>
          <section aria-label="Money" className="flex flex-col gap-3.5 rounded-2xl bg-white p-5 shadow-seline-hero">
            <p className="text-[17px] leading-snug">
              <strong className="font-display text-[40px] font-normal leading-none tracking-[-0.03em] tabular-nums">{cedis(all.paid)}</strong>
              <span className="text-warm-gray"> of {cedis(all.expected)}</span> paid
            </p>
            <StackedBar parts={moneyParts} className="h-2" />
            <Legend parts={moneyParts} format={cedis} />
            <Legend parts={statusParts(all, false)} />
          </section>

          {groups.length > 1 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[15px] font-semibold">By group</h2>
              <ol className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
                {groups.map((g, i) => (
                  <li key={g.name} className="flex min-h-[52px] items-center gap-3.5 border-t border-stone-border px-4 py-2 first:border-t-0">
                    <span className="w-6 flex-none text-right text-[13px] tabular-nums text-warm-gray">{i + 1}</span>
                    <span className="w-28 flex-none truncate text-[15px] font-medium sm:w-36">{g.name}</span>
                    <StackedBar className="h-1.5 flex-1" parts={statusParts(g.t, false)} />
                    <span className="w-24 flex-none text-right text-[13px] tabular-nums text-warm-gray max-sm:hidden">{cedis(g.t.paid)}</span>
                    <span className="w-8 flex-none text-right text-[15px] tabular-nums">{active(g.t)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="flex flex-col gap-2.5">
            {groups.length > 1 && <h2 className="text-[15px] font-semibold">By fellowship</h2>}
            <ol className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
              {ranked.map((f, i) => {
                const n = active(f);
                return (
                  <li key={f.name} className="border-t border-stone-border first:border-t-0">
                    <Link href={`${people}?fellowship=${encodeURIComponent(f.name)}`} className="cm-row flex min-h-[64px] items-center gap-3.5 px-4 py-2.5">
                      <span className="w-6 flex-none text-right text-[13px] tabular-nums text-warm-gray">{i + 1}</span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[15px] font-medium">
                            {f.name}
                            {!leader && f.group && <span className="font-normal text-warm-gray"> · {f.group}</span>}
                          </span>
                          <span className="flex-none text-[15px] tabular-nums">
                            {n}
                            <span className="text-[13px] text-warm-gray"> · {Math.round((n / everyone) * 100)}%</span>
                          </span>
                        </span>
                        {/* Bar length is relative to the top fellowship, so the ranking reads at a glance. */}
                        <span className="block" style={{ width: `${Math.max(4, (n / top) * 100)}%` }}>
                          <StackedBar className="h-1.5" parts={statusParts({ fully_paid: f.fully_paid, partially_paid: f.partially_paid, registered: f.registered }, false)} />
                        </span>
                        <span className="truncate text-[13px] text-warm-gray">
                          {cedis(f.paid)} of {cedis(f.expected)} paid
                          {[f.fully_paid && ` · ${f.fully_paid} fully paid`, f.partially_paid && ` · ${f.partially_paid} part paid`, f.registered && ` · ${f.registered} nothing paid`]
                            .filter(Boolean)
                            .join("")}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 flex-none text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
