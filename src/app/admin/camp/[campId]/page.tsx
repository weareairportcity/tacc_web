import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeftRight, BedDouble, CalendarDays, ChevronRight, RotateCcw } from "lucide-react";
import { query } from "@/lib/cf";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { daysUntil, registrationPhase, todayInGhana } from "@/lib/camp/registrations";
import { getDashboard, getTodayNumbers } from "@/lib/camp/reports";
import { Legend, StackedBar, formatDate, headlineClass, statusParts, type BarPart } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../access";

/** "ama.mensah@…" → "Ama". */
const firstName = (email: string) => {
  const word = email.split("@")[0].split(/[._-]/)[0];
  return word ? word[0].toUpperCase() + word.slice(1) : "";
};

const greeting = () => {
  const hour = new Date().getUTCHours(); // Ghana is UTC+0
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

const cedis = (p: number) => formatCedis(p).replace(/\.00$/, "");

const since = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} d`;
};

/**
 * Today: the camp at a glance. What needs you first, then the four numbers,
 * then how they're moving. Each block links to the page that owns it.
 */
export default async function Today({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator", "leader");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  if (staff.role === "leader") redirect(`/admin/camp/${campId}/people`);

  const [camp, d, t, requests] = await Promise.all([
    getCamp(campId),
    getDashboard(campId),
    getTodayNumbers(campId),
    query<{ kind: string; n: number; oldest: string }>(
      "app",
      "SELECT kind, COUNT(*) AS n, MIN(created_at) AS oldest FROM camp_requests WHERE camp_id = ? AND status = 'pending' GROUP BY kind",
      [campId],
    ),
  ]);
  if (!camp) notFound();

  const base = `/admin/camp/${camp.id}`;
  const people = `${base}/people`;
  const phase = registrationPhase(camp);
  const live = d.status.registered + d.status.partially_paid + d.status.fully_paid;
  const refunds = requests.find((r) => r.kind === "refund");
  const changes = requests.find((r) => r.kind === "room_change");
  const low = d.supply.filter((s) => s.places_left !== null && s.places_left <= 5);
  const short = d.supply.filter((s) => s.fully_paid > s.beds);
  const who = (g: string) => (g === "male" ? "Men" : "Women");
  const ago = (iso: string) => {
    const days = daysUntil(todayInGhana(), iso.slice(0, 10));
    return days === 0 ? "today" : days === 1 ? "since yesterday" : `oldest ${days} days`;
  };

  const todo: { icon: typeof BedDouble; text: string; meta?: string; href: string }[] = [
    ...(refunds ? [{ icon: RotateCcw, text: `${refunds.n} refund request${refunds.n === 1 ? "" : "s"}`, meta: ago(refunds.oldest), href: `${base}/requests` }] : []),
    ...(changes ? [{ icon: ArrowLeftRight, text: `${changes.n} room change${changes.n === 1 ? "" : "s"}`, meta: ago(changes.oldest), href: `${base}/requests` }] : []),
    ...(d.money.flagged ? [{ icon: AlertTriangle, text: `${d.money.flagged} payment${d.money.flagged === 1 ? "" : "s"} to check`, href: `${base}/money` }] : []),
    ...low.map((s) => ({
      icon: BedDouble,
      text: `${s.room_type_name} · ${who(s.gender)}: ${s.places_left === 0 ? "full" : `${s.places_left} left`}`,
      href: `${base}/rooms?tab=types`,
    })),
    ...short.map((s) => ({ icon: AlertTriangle, text: `${s.room_type_name} · ${who(s.gender)}: ${s.fully_paid - s.beds} short of beds`, href: `${base}/rooms?tab=all` })),
  ];

  const dates = [
    phase !== "closed" && { label: phase === "upcoming" ? "Registration opens" : "Registration closes", date: phase === "upcoming" ? camp.registration_opens_on : camp.registration_closes_on },
    { label: "Payment due", date: camp.payment_due_on },
    { label: "Roommates by", date: camp.roommate_deadline_on },
    { label: "Camp", date: camp.starts_on },
  ].filter((x): x is { label: string; date: string } => !!x);

  const beds = d.supply.reduce((n, s) => n + s.beds, 0);
  const near = daysUntil(camp.starts_on) <= 7 || t.arrived > 0;
  const maxDay = Math.max(1, ...t.perDay.map((x) => x.n));
  const week = t.perDay.slice(7).reduce((n, x) => n + x.n, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-[13px] text-warm-gray">
          {phase === "open" && <span className="cm-pulse h-[7px] w-[7px] rounded-full bg-cyan-signal" aria-hidden="true" />}
          {camp.status === "draft" ? "Draft · only coordinators can see it" : phase === "open" ? "Registration open" : phase === "upcoming" ? "Registration not open yet" : "Registration closed"}
          {" · "}camp in {daysUntil(camp.starts_on)} days
        </p>
        <h1 className={`cm-rise ${headlineClass} text-[34px]`}>
          {greeting()}
          {firstName(staff.email) && (
            <>
              , <span className="text-cyan-edge">{firstName(staff.email)}</span>
            </>
          )}
        </h1>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[#57534e]">
          {dates.map((x) => (
            <li key={x.label} className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
              {x.label} <strong className="font-medium text-ink-black">{formatDate(x.date).replace(/ \d{4}$/, "")}</strong>
            </li>
          ))}
        </ul>
      </header>

      <section aria-label="Numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile href={people} label="People" big={String(live)} sub={t.newToday ? `+${t.newToday} today` : "none new today"} delay={0} />
        <Tile href={`${base}/money`} label="Collected" big={cedis(d.money.collected)} sub={t.moneyToday ? `+${cedis(t.moneyToday)} today` : `${d.money.expected ? Math.round((d.money.collected / d.money.expected) * 100) : 0}% of expected`} delay={50} lifted />
        <Tile href={`${people}?status=outstanding`} label="Outstanding" big={cedis(d.money.outstanding)} sub={`${t.outstandingPeople} ${t.outstandingPeople === 1 ? "person" : "people"}`} delay={100} />
        {near ? (
          <Tile href={`${base}/check-in`} label="Arrived" big={String(t.arrived)} sub={`of ${live}`} delay={150} />
        ) : (
          <Tile href={`${base}/rooms`} label="In rooms" big={String(d.allocation.placed)} sub={`of ${d.status.fully_paid} fully paid`} delay={150} />
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Needs you">
          {todo.length ? (
            <ul className="-mx-5 -mb-2 divide-y divide-stone-border border-t border-stone-border">
              {todo.map(({ icon: Icon, text, meta, href }) => (
                <li key={text}>
                  <Link href={href} className="cm-row flex min-h-[50px] items-center gap-3.5 px-5 py-2">
                    <Icon className="h-[18px] w-[18px] flex-none" strokeWidth={1.6} aria-hidden="true" />
                    <span className="flex-1 text-[15px] font-medium">{text}</span>
                    {meta && <span className="text-[13px] text-warm-gray">{meta}</span>}
                    <ChevronRight className="h-4 w-4 text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-warm-gray">Nothing waiting.</p>
          )}
        </Panel>

        <Panel title="Payments" href={people}>
          <StackedBar parts={statusParts(d.status)} />
          <Legend columns={2} parts={statusParts(d.status)} />
          <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-stone-border pt-3.5 text-[13px] tabular-nums">
            <div className="flex flex-col gap-0.5">
              <dt className="text-warm-gray">Expected</dt>
              <dd className="text-[15px] font-medium">{cedis(d.money.expected)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-warm-gray">Past due date</dt>
              <dd className="text-[15px] font-medium">{d.pastDue} {d.pastDue === 1 ? "person" : "people"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-warm-gray">Refunded</dt>
              <dd className="text-[15px] font-medium">{cedis(d.money.refunded)}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Registrations" note={`${week} this week`} href={people}>
          <div className="flex h-20 items-end gap-1" role="img" aria-label={`Registrations per day, last 14 days: ${t.perDay.map((x) => x.n).join(", ")}`}>
            {t.perDay.map((x, i) => (
              <span key={x.day} className="group relative flex h-full flex-1 items-end" title={`${formatDate(x.day)}: ${x.n}`}>
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
        </Panel>

        <Panel title="Rooms" note={`${d.allocation.placed} placed · ${Math.max(0, beds - d.allocation.placed)} beds free`} href={`${base}/rooms?tab=all`}>
          <ul className="flex flex-col text-sm">
            {d.supply.map((s) => (
              <li key={`${s.room_type_id}.${s.gender}`} className="flex items-center gap-3 border-t border-stone-border py-2 first:border-t-0 first:pt-0">
                <span className="w-32 truncate">
                  {s.room_type_name} · {who(s.gender)}
                </span>
                <StackedBar
                  className="h-1.5 flex-1"
                  parts={
                    [
                      { key: "placed", value: s.placed, color: "bg-cyan-edge", label: "Placed" },
                      { key: "wait", value: Math.max(0, s.fully_paid - s.placed), color: "bg-sky-wash", label: "Waiting" },
                      { key: "free", value: Math.max(0, s.beds - s.fully_paid), color: "bg-stone-border", label: "Free" },
                    ] satisfies BarPart[]
                  }
                />
                <span className="w-16 text-right text-xs tabular-nums text-warm-gray">
                  {s.places_left === null ? `${s.placed}/${s.beds}` : s.places_left === 0 ? "Full" : `${s.places_left} left`}
                </span>
              </li>
            ))}
            {d.supply.length === 0 && <li className="text-warm-gray">No rooms yet.</li>}
          </ul>
        </Panel>

        <Panel title="Latest payments" href={`${base}/history?what=money`}>
          {t.latestPayments.length ? (
            <ul className="flex flex-col text-sm">
              {t.latestPayments.map((p) => (
                <li key={`${p.registration_id}.${p.paid_at}`} className="border-t border-stone-border first:border-t-0">
                  <Link href={`${people}?person=${p.registration_id}`} className="cm-row -mx-2 flex min-h-10 items-center gap-3 rounded-[6px] px-2">
                    <span className="flex-1 truncate">
                      {p.full_name}
                      {p.by && <span className="text-warm-gray"> · {p.by === "coordinator" ? "by a coordinator" : `by ${p.by}`}</span>}
                    </span>
                    <span className="tabular-nums">{cedis(p.amount_pesewas)}</span>
                    <span className="w-12 text-right text-xs text-warm-gray">{since(p.paid_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-warm-gray">No payments yet.</p>
          )}
        </Panel>

        <Panel title="Fellowships" note="most registered" href={people}>
          <ul className="flex flex-col text-sm">
            {d.byFellowship.slice(0, 5).map((f) => (
              <li key={f.name} className="border-t border-stone-border first:border-t-0">
                <Link href={`${people}?fellowship=${encodeURIComponent(f.name)}`} className="cm-row -mx-2 flex min-h-10 items-center gap-3 rounded-[6px] px-2">
                  <span className="w-28 truncate">{f.name}</span>
                  <StackedBar className="h-1.5 flex-1" parts={statusParts({ fully_paid: f.fully_paid, partially_paid: f.partially_paid, registered: f.registered }, false)} />
                  <span className="w-7 text-right tabular-nums">{f.registered + f.partially_paid + f.fully_paid}</span>
                </Link>
              </li>
            ))}
            {d.byFellowship.length === 0 && <li className="text-warm-gray">No registrations yet.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Tile({ href, label, big, sub, delay, lifted }: { href: string; label: string; big: string; sub: string; delay: number; lifted?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "cm-rise cm-press flex flex-col gap-1.5 bg-white p-4 sm:p-5",
        lifted ? "rounded-2xl shadow-seline-hero" : "rounded-[10px] border border-stone-border shadow-seline-card",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="text-[13px] text-warm-gray">{label}</span>
      <span className="font-display text-[28px] leading-none tracking-[-0.024em] tabular-nums sm:text-[32px]">{big}</span>
      <span className="text-[13px] text-[#57534e]">{sub}</span>
    </Link>
  );
}

function Panel({ title, note, href, children }: { title: string; note?: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <span className="flex items-center gap-2 text-[13px] text-warm-gray">
          {note}
          {href && (
            <Link href={href} aria-label={`Open ${title}`} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-stone-canvas">
              <ChevronRight className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            </Link>
          )}
        </span>
      </div>
      {children}
    </section>
  );
}
