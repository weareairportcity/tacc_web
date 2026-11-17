import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { arrivalCounts } from "@/lib/camp/checkin";
import { daysUntil, todayInGhana } from "@/lib/camp/registrations";
import { getDashboard, getFellowshipBreakdown, getTodayNumbers, latestRegistrations } from "@/lib/camp/reports";
import { FellowshipRanking, GroupRanking, active, cedis, rankGroups, sum } from "@/components/camp/FellowshipRanking";
import { Legend, RegistrationStatus, StackedBar, formatDate, headlineClass, statusParts, type BarPart } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../../access";

const who = (g: string) => (g === "male" ? "Men" : "Women");

/** A dashboard tile: a hairline card with a title row. `className` places it in the grid. */
function Tile({ title, note, className, children }: { title: string; note?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {note && <span className="truncate text-[13px] text-warm-gray">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** One number in the hero's side column. */
function Figure({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 border-t border-stone-border pt-3">
      <span className="text-[13px] text-warm-gray">{label}</span>
      <span className="font-display text-[26px] leading-none tracking-[-0.024em] tabular-nums sm:text-[30px]">{value}</span>
      {sub && <span className="text-[12px] text-warm-gray">{sub}</span>}
    </div>
  );
}

/**
 * The Pastor's report: the whole camp as a dashboard, read-only. A hero card
 * with the money and today's numbers, then tiles that reflow from one column
 * on a phone to two on an iPad and three on a wide screen. Paying for people
 * is on Pay.
 */
export default async function ReportPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator", "pastor");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();
  const today = todayInGhana();
  const during = today >= camp.starts_on && today <= camp.ends_on;
  const [d, t, ranked, latest, arrivals] = await Promise.all([
    getDashboard(camp.id),
    getTodayNumbers(camp.id),
    getFellowshipBreakdown(camp.id, { kind: "all" }),
    latestRegistrations(camp.id, 12),
    during ? arrivalCounts(camp.id) : null,
  ]);

  const all = sum(ranked);
  const live = active(all);
  const left = Math.max(0, all.expected - all.paid);
  const share = all.expected ? Math.round((all.paid / all.expected) * 100) : 0;
  const groups = rankGroups(ranked);
  const maxDay = Math.max(1, ...t.perDay.map((x) => x.n));
  const week = t.perDay.slice(7).reduce((n, x) => n + x.n, 0);
  const beds = d.supply.reduce((n, s) => n + s.beds, 0);
  const toCamp = daysUntil(today, camp.starts_on);
  const money: BarPart[] = [
    { key: "paid", value: all.paid, color: "bg-st-paid", label: "Paid" },
    { key: "left", value: left, color: "bg-stone-border", label: "Left to pay" },
  ];
  const status = statusParts({ fully_paid: d.status.fully_paid, partially_paid: d.status.partially_paid, registered: d.status.registered, cancelled: d.status.cancelled });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1.5">
        <h1 className={`${headlineClass} text-[34px]`}>Report</h1>
        <p className="text-[14px] text-warm-gray">
          {camp.name} · {formatDate(camp.starts_on)}
          {toCamp > 0 ? ` · ${toCamp} ${toCamp === 1 ? "day" : "days"} to go` : during ? " · camp is on" : ""}
        </p>
      </header>

      {/* Hero: the money first, today's numbers beside it (below it on a phone). */}
      <section aria-label="Money and today" className="grid gap-6 rounded-2xl bg-white p-5 shadow-seline-hero sm:p-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:gap-8">
        <div className="flex min-w-0 flex-col gap-4">
          <span className="text-[13px] text-warm-gray">Paid so far</span>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="font-display text-[44px] font-normal leading-none tracking-[-0.03em] tabular-nums sm:text-[56px]">{cedis(all.paid)}</strong>
            <span className="text-[15px] text-warm-gray">
              of {cedis(all.expected)} · {share}%
            </span>
          </p>
          <StackedBar parts={money} className="h-2.5" />
          <Legend parts={money} format={cedis} />
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 self-end">
          <Figure value={live} label="Registered" sub={`${d.status.cancelled} cancelled`} />
          <Figure value={d.status.fully_paid} label="Fully paid" sub={`${t.outstandingPeople} not fully paid yet`} />
          <Figure value={t.newToday} label="Registered today" sub={`${week} this week`} />
          <Figure value={cedis(t.moneyToday)} label="Paid today" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Tile title="Registrations" note="last 14 days" className="md:col-span-2">
          <div className="flex h-28 items-end gap-1 sm:gap-1.5" role="img" aria-label={`Registrations per day, last 14 days: ${t.perDay.map((x) => x.n).join(", ")}`}>
            {t.perDay.map((x, i) => (
              <span key={x.day} className="flex h-full flex-1 items-end" title={`${formatDate(x.day)}: ${x.n}`}>
                <span
                  className={cn("cm-grow-y w-full rounded-t-[3px]", i === t.perDay.length - 1 ? "bg-cyan-edge" : "bg-sky-wash")}
                  style={{ height: `${Math.max(x.n ? 8 : 2, (x.n / maxDay) * 100)}%`, animationDelay: `${i * 25}ms` }}
                />
              </span>
            ))}
          </div>
          <span className="flex justify-between text-xs text-warm-gray">
            <span>{formatDate(t.perDay[0].day).replace(/ \d{4}$/, "")}</span>
            <span>Today {t.perDay.at(-1)!.n}</span>
          </span>
        </Tile>

        <Tile title="Payment status" note={`${live} registered`}>
          <StackedBar parts={status} className="h-2" />
          <Legend parts={status} columns={2} />
        </Tile>

        {groups.length > 0 && (
          <Tile title="Groups" note="most registered">
            <GroupRanking groups={groups} bare />
          </Tile>
        )}

        <Tile title="Rooms" note={`${d.allocation.placed} placed · ${Math.max(0, beds - d.allocation.placed)} beds free`}>
          <ul className="flex flex-col text-sm">
            {d.supply.map((s) => (
              <li key={`${s.room_type_id}.${s.gender}`} className="flex items-center gap-3 border-t border-stone-border py-2 first:border-t-0 first:pt-0">
                <span className="min-w-0 flex-1 truncate">
                  {s.room_type_name} · {who(s.gender)}
                </span>
                <span className="flex-none tabular-nums text-warm-gray">
                  {s.registered}
                  {s.places_left !== null && ` · ${s.places_left === 0 ? "full" : `${s.places_left} left`}`}
                </span>
              </li>
            ))}
            {d.supply.length === 0 && <li className="text-warm-gray">No room types yet.</li>}
          </ul>
          {d.allocation.waiting > 0 && <p className="border-t border-stone-border pt-3 text-[13px] text-warm-gray">{d.allocation.waiting} fully paid and waiting for a room.</p>}
        </Tile>

        {arrivals && (
          <Tile title="Check-in" note="camp is on">
            <div className="grid grid-cols-2 gap-4">
              <Figure value={`${arrivals.here} of ${arrivals.expected}`} label="Arrived" />
              <Figure value={arrivals.shirts} label="T-shirts given" />
            </div>
          </Tile>
        )}

        {ranked.length > 0 && (
          <Tile title="Fellowships" note={`all ${ranked.length}, most registered`} className="md:col-span-2 xl:row-span-2">
            <FellowshipRanking ranked={ranked} showGroup bare />
          </Tile>
        )}

        <Tile title="Latest registrations" note="newest first" className="md:col-span-2 xl:col-span-1">
          <ul className="-mt-1 flex flex-col text-sm">
            {latest.map((r) => (
              <li key={r.id} className="flex items-center gap-3 border-t border-stone-border py-2.5 first:border-t-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-medium">{r.full_name}</span>
                  <span className="truncate text-[13px] text-warm-gray">
                    {r.fellowship} · {formatDate(r.created_at.slice(0, 10)).replace(/ \d{4}$/, "")}
                  </span>
                </span>
                <span className="flex flex-none flex-col items-end gap-1">
                  <RegistrationStatus status={r.status} />
                  <span className="text-[12px] tabular-nums text-warm-gray">
                    {cedis(r.paid_pesewas)} of {cedis(r.price_pesewas)}
                  </span>
                </span>
              </li>
            ))}
            {latest.length === 0 && <li className="text-warm-gray">No registrations yet.</li>}
          </ul>
          <Link href={`/admin/camp/${camp.id}/pay`} className="mt-auto flex items-center gap-1 border-t border-stone-border pt-3 text-[14px] font-medium">
            See everyone and pay for people <ChevronRight className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </Tile>
      </div>
    </div>
  );
}
