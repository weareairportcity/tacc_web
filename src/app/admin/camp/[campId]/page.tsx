import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeftRight, BedDouble, ChevronRight, RotateCcw } from "lucide-react";
import { query } from "@/lib/cf";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { daysUntil, registrationPhase, todayInGhana } from "@/lib/camp/registrations";
import { getDashboard } from "@/lib/camp/reports";
import { Legend, StackedBar, headlineClass, statusParts, type BarPart } from "@/components/camp/ui";
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

/** Today: what needs a coordinator, then three numbers. Everything else lives on its own page. */
export default async function Today({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator", "leader");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  if (staff.role === "leader") redirect(`/admin/camp/${campId}/people`);

  const [camp, d, requests, newToday] = await Promise.all([
    getCamp(campId),
    getDashboard(campId),
    query<{ kind: string; n: number; oldest: string }>(
      "app",
      "SELECT kind, COUNT(*) AS n, MIN(created_at) AS oldest FROM camp_requests WHERE camp_id = ? AND status = 'pending' GROUP BY kind",
      [campId],
    ),
    query<{ n: number }>("app", "SELECT COUNT(*) AS n FROM camp_registrations WHERE camp_id = ? AND substr(created_at, 1, 10) = ?", [campId, todayInGhana()]),
  ]);
  if (!camp) notFound();

  const base = `/admin/camp/${camp.id}`;
  const phase = registrationPhase(camp);
  const live = d.status.registered + d.status.partially_paid + d.status.fully_paid;
  const refunds = requests.find((r) => r.kind === "refund");
  const changes = requests.find((r) => r.kind === "room_change");
  const low = d.supply.filter((s) => s.places_left !== null && s.places_left <= 5);
  const short = d.supply.filter((s) => s.fully_paid > s.beds);
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
      text: `${s.room_type_name} · ${s.gender === "male" ? "Men" : "Women"}: ${s.places_left === 0 ? "full" : `${s.places_left} left`}`,
      href: `${base}/rooms?tab=types`,
    })),
    ...short.map((s) => ({
      icon: AlertTriangle,
      text: `${s.room_type_name} · ${s.gender === "male" ? "Men" : "Women"}: ${s.fully_paid - s.beds} short of beds`,
      href: `${base}/rooms?tab=all`,
    })),
  ];

  const beds = d.supply.reduce((n, s) => n + s.beds, 0);
  const roomParts: BarPart[] = [
    { key: "placed", value: d.allocation.placed, color: "bg-cyan-edge", label: "Placed" },
    { key: "waiting", value: d.allocation.waiting, color: "bg-sky-wash", label: "Waiting" },
    { key: "free", value: Math.max(0, beds - d.allocation.placed), color: "bg-stone-border", label: "Free beds" },
  ];
  const percent = d.money.expected ? Math.round((d.money.collected / d.money.expected) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="flex items-center gap-2 text-[13px] text-warm-gray">
          {phase === "open" && <span className="cm-pulse h-[7px] w-[7px] rounded-full bg-cyan-signal" aria-hidden="true" />}
          {camp.status === "draft"
            ? "Draft · only coordinators can see it"
            : phase === "open"
              ? `Registration open · camp in ${daysUntil(camp.starts_on)} days`
              : phase === "upcoming"
                ? `Registration opens in ${daysUntil(camp.registration_opens_on)} days`
                : `Registration closed · camp in ${daysUntil(camp.starts_on)} days`}
        </p>
        <h1 className={`cm-rise ${headlineClass} text-[34px]`}>
          {greeting()}
          {firstName(staff.email) && (
            <>
              , <span className="text-cyan-edge">{firstName(staff.email)}</span>
            </>
          )}
        </h1>
      </header>

      {todo.length > 0 ? (
        <section aria-label="Needs you" className="cm-rise overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
          <ul className="divide-y divide-stone-border">
            {todo.map(({ icon: Icon, text, meta, href }) => (
              <li key={text}>
                <Link href={href} className="cm-row flex min-h-[52px] items-center gap-3.5 px-4 py-2.5">
                  <Icon className="h-[19px] w-[19px] flex-none" strokeWidth={1.6} aria-hidden="true" />
                  <span className="flex-1 text-[15px] font-medium">{text}</span>
                  {meta && <span className="text-[13px] text-warm-gray">{meta}</span>}
                  <ChevronRight className="h-4 w-4 text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="cm-rise rounded-[10px] border border-stone-border bg-white px-4 py-3.5 text-[15px]">Nothing waiting for you.</p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard href={`${base}/money`} label="Money" big={formatCedis(d.money.collected).replace(/\.00$/, "")} sub={`${percent}% of ${formatCedis(d.money.expected).replace(/\.00$/, "")}`} delay={60} lifted>
          <StackedBar
            parts={[
              { key: "in", value: d.money.collected, color: "bg-st-paid", label: "Collected" },
              { key: "out", value: d.money.outstanding, color: "bg-stone-border", label: "Outstanding" },
            ]}
            label={`${formatCedis(d.money.collected)} collected, ${formatCedis(d.money.outstanding)} outstanding`}
          />
          <Legend
            columns={1}
            parts={[{ key: "out", value: d.money.outstanding, color: "bg-stone-border", label: "Outstanding" }]}
            format={(n) => formatCedis(n)}
          />
        </StatCard>
        <StatCard href={`${base}/people`} label="People" big={String(live)} sub={newToday[0]?.n ? `+${newToday[0].n} today` : ""} delay={120}>
          <StackedBar parts={statusParts(d.status)} />
          <Legend columns={2} parts={statusParts(d.status)} />
        </StatCard>
        <StatCard href={`${base}/rooms`} label="Rooms" big={String(d.allocation.placed)} sub={`placed of ${d.status.fully_paid} paid`} delay={180}>
          <StackedBar parts={roomParts} />
          <Legend columns={2} parts={roomParts} />
        </StatCard>
      </div>
    </div>
  );
}

function StatCard({
  href,
  label,
  big,
  sub,
  children,
  delay,
  lifted,
}: {
  href: string;
  label: string;
  big: string;
  sub: string;
  children: React.ReactNode;
  delay: number;
  lifted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`cm-rise cm-press flex flex-col gap-3.5 bg-white p-5 ${lifted ? "rounded-2xl shadow-seline-hero" : "rounded-[10px] border border-stone-border shadow-seline-card"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="flex items-center justify-between text-sm text-warm-gray">
        {label}
        <ChevronRight className="h-4 w-4 text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-display text-[34px] leading-none tracking-[-0.026em] tabular-nums">{big}</span>
        {sub && <span className="text-sm text-warm-gray">{sub}</span>}
      </span>
      {children}
    </Link>
  );
}
