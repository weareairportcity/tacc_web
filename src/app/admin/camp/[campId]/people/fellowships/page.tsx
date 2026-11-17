import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ID } from "@/lib/camp/camps";
import { getDashboard, type Breakdown } from "@/lib/camp/reports";
import { Legend, StackedBar, headlineClass, statusParts } from "@/components/camp/ui";
import { PeopleTabs } from "@/components/camp/PeopleTabs";
import { NoAccess, pageStaff } from "../../../access";

const active = (f: Breakdown) => f.registered + f.partially_paid + f.fully_paid;

/** People › Fellowships: every fellowship, ranked by how many have registered (cancelled left out). Tap one to see its people. */
export default async function FellowshipsPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const d = await getDashboard(campId);
  const ranked = d.byFellowship
    .filter((f) => active(f) > 0)
    .sort((a, b) => active(b) - active(a) || b.fully_paid - a.fully_paid || a.name.localeCompare(b.name));
  const everyone = ranked.reduce((n, f) => n + active(f), 0);
  const top = ranked[0] ? active(ranked[0]) : 0;
  const people = `/admin/camp/${campId}/people`;

  return (
    <div className="flex flex-col gap-5">
      <h1 className={`${headlineClass} text-[34px]`}>People</h1>
      <PeopleTabs campId={campId} current="fellowships" />
      <header className="flex flex-col gap-1.5">
        <p className="text-[15px] text-warm-gray">
          All {ranked.length} ranked by how many have registered. {everyone} {everyone === 1 ? "person" : "people"} in all; cancelled registrations aren&apos;t counted.
        </p>
      </header>

      {ranked.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white p-6 text-center text-[15px] text-warm-gray">No registrations yet.</p>
      ) : (
        <>
          <Legend
            parts={statusParts(
              ranked.reduce((t, f) => ({ fully_paid: t.fully_paid + f.fully_paid, partially_paid: t.partially_paid + f.partially_paid, registered: t.registered + f.registered }), { fully_paid: 0, partially_paid: 0, registered: 0 }),
              false,
            )}
          />
          <ol className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
            {ranked.map((f, i) => {
              const n = active(f);
              return (
                <li key={f.name} className="border-t border-stone-border first:border-t-0">
                  <Link href={`${people}?fellowship=${encodeURIComponent(f.name)}`} className="cm-row flex min-h-[64px] items-center gap-3.5 px-4 py-2.5">
                    <span className="w-6 flex-none text-right text-[13px] tabular-nums text-warm-gray">{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[15px] font-medium">{f.name}</span>
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
                        {[f.fully_paid && `${f.fully_paid} fully paid`, f.partially_paid && `${f.partially_paid} part paid`, f.registered && `${f.registered} nothing paid`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 flex-none text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
