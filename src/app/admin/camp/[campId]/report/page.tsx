import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { arrivalCounts } from "@/lib/camp/checkin";
import { daysUntil, todayInGhana } from "@/lib/camp/registrations";
import { getDashboard, getFellowshipBreakdown, getTodayNumbers, latestRegistrations } from "@/lib/camp/reports";
import { FellowshipRanking, GroupRanking, MoneyCard, active, cedis, rankGroups, sum } from "@/components/camp/FellowshipRanking";
import { RegistrationStatus, formatDate, headlineClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../../access";

const who = (g: string) => (g === "male" ? "Men" : "Women");

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {note && <span className="text-[13px] text-warm-gray">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Stat({ big, label }: { big: string | number; label: string }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="font-display text-[28px] leading-none tracking-[-0.024em] tabular-nums">{big}</span>
      <span className="text-[13px] text-warm-gray">{label}</span>
    </span>
  );
}

/**
 * The Pastor's report: the whole camp on one page, read-only. Everything a
 * report needs (today, money, payment status, the last two weeks, groups and
 * fellowships ranked, rooms, check-in, who registered last), and
 * nothing to do but read it. Paying for people is on Pay.
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
    latestRegistrations(camp.id, 15),
    during ? arrivalCounts(camp.id) : null,
  ]);

  const all = sum(ranked);
  const live = active(all);
  const groups = rankGroups(ranked);
  const maxDay = Math.max(1, ...t.perDay.map((x) => x.n));
  const week = t.perDay.slice(7).reduce((n, x) => n + x.n, 0);
  const beds = d.supply.reduce((n, s) => n + s.beds, 0);
  const toCamp = daysUntil(today, camp.starts_on);
  const base = `/admin/camp/${camp.id}`;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1 className={`${headlineClass} text-[34px]`}>Report</h1>
        <p className="text-[15px] text-warm-gray">
          {camp.name} · {formatDate(camp.starts_on)}
          {toCamp > 0 ? ` · ${toCamp} ${toCamp === 1 ? "day" : "days"} to go` : during ? " · camp is on" : ""}. Updated each time you open it.
        </p>
      </header>

      <MoneyCard all={all} label="paid so far" />

      <Card title="Today" note={formatDate(today)}>
        <div className="grid grid-cols-2 gap-4">
          <Stat big={t.newToday} label="registered today" />
          <Stat big={cedis(t.moneyToday)} label="paid today" />
          <Stat big={d.status.fully_paid} label="fully paid" />
          <Stat big={t.outstandingPeople} label="not fully paid yet" />
        </div>
      </Card>

      <Card title="Registrations" note={`${week} this week`}>
        <div className="flex h-20 items-end gap-1" role="img" aria-label={`Registrations per day, last 14 days: ${t.perDay.map((x) => x.n).join(", ")}`}>
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
        <p className="border-t border-stone-border pt-3 text-[13px] text-warm-gray">
          {live} registered · {d.status.cancelled} cancelled
          {d.money.refunded > 0 && ` · ${cedis(d.money.refunded)} refunded`}
        </p>
      </Card>

      {groups.length > 0 && (
        <Card title="Groups" note="most registered">
          <GroupRanking groups={groups} />
        </Card>
      )}

      {ranked.length > 0 && (
        <Card title="Fellowships" note={`all ${ranked.length}, most registered`}>
          <FellowshipRanking ranked={ranked} showGroup />
        </Card>
      )}

      <Card title="Rooms" note={`${d.allocation.placed} placed · ${Math.max(0, beds - d.allocation.placed)} beds free`}>
        <ul className="flex flex-col text-sm">
          {d.supply.map((s) => (
            <li key={`${s.room_type_id}.${s.gender}`} className="flex items-center gap-3 border-t border-stone-border py-2 first:border-t-0 first:pt-0">
              <span className="min-w-0 flex-1 truncate">
                {s.room_type_name} · {who(s.gender)}
              </span>
              <span className="tabular-nums text-warm-gray">
                {s.registered} in{s.places_left !== null && ` · ${s.places_left === 0 ? "full" : `${s.places_left} left`}`}
              </span>
            </li>
          ))}
          {d.supply.length === 0 && <li className="text-warm-gray">No room types yet.</li>}
        </ul>
        {d.allocation.waiting > 0 && <p className="text-[13px] text-warm-gray">{d.allocation.waiting} fully paid and waiting for a room.</p>}
      </Card>

      {arrivals && (
        <Card title="Check-in" note="camp is on">
          <div className="grid grid-cols-2 gap-4">
            <Stat big={`${arrivals.here} of ${arrivals.expected}`} label="arrived" />
            <Stat big={arrivals.shirts} label="T-shirts given" />
          </div>
        </Card>
      )}

      <Card title="Latest registrations" note="newest first">
        <ul className="flex flex-col text-sm">
          {latest.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-t border-stone-border py-2.5 first:border-t-0 first:pt-0">
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
        <Link href={`${base}/pay`} className="flex items-center gap-1 border-t border-stone-border pt-3 text-[14px] font-medium">
          See everyone and pay for people <ChevronRight className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </Link>
      </Card>
    </div>
  );
}
