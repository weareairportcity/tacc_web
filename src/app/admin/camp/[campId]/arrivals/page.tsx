import Link from "next/link";
import { notFound } from "next/navigation";
import { Bus, Check, Footprints } from "lucide-react";
import { campDays, TIME_WORDS, ARRIVAL_TIMES, type ArrivalTime } from "@/lib/camp/arrival";
import { listArrivals, type ArrivalPerson } from "@/lib/camp/arrivals";
import { getCamp, ID } from "@/lib/camp/camps";
import { headlineClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../../access";
import { PersonLink } from "@/components/camp/shell/PersonOnThisPage";

/**
 * Coordinators: who is arriving on which day (a tab per camp day, checked-in
 * people highlighted), and how everyone is getting here (bus, or by themselves).
 */
export default async function ArrivalsPage({ params, searchParams }: { params: Promise<{ campId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp) notFound();
  const { tab = "" } = await searchParams;
  const [people] = await Promise.all([listArrivals(camp.id)]);
  const days = campDays(camp);
  const base = `/admin/camp/${camp.id}/arrivals`;

  const answered = people.filter((p) => p.arrival_day);
  const unanswered = people.filter((p) => !p.arrival_day);
  const current = tab === "transport" || tab === "unanswered" ? tab : days.some((d) => d.date === tab) ? tab : (days.find((d) => d.date >= new Date().toISOString().slice(0, 10))?.date ?? days[0]?.date ?? "transport");
  const arrived = (rows: ArrivalPerson[]) => rows.filter((p) => p.checked_in_at).length;

  const tabs = [
    ...days.map((d) => ({ key: d.date, label: d.name, count: people.filter((p) => p.arrival_day === d.date).length })),
    { key: "transport", label: "Transport", count: answered.length },
    { key: "unanswered", label: "Not answered", count: unanswered.length },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <h1 className={`${headlineClass} text-[34px]`}>Arrivals</h1>
        <p className="text-[15px] text-warm-gray">
          {answered.length} of {people.length} have said when and how they&apos;re coming. {arrived(people)} {arrived(people) === 1 ? "has" : "have"} checked in.
        </p>
        <nav aria-label="Arrival views" className="flex gap-1 overflow-x-auto rounded-full border border-stone-border bg-white p-[3px]">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`${base}?tab=${t.key}`}
              aria-current={current === t.key ? "page" : undefined}
              className={cn("cm-press flex h-9 flex-none items-center gap-1.5 rounded-full px-3.5 text-sm font-medium", current === t.key ? "bg-soot text-white" : "text-[#57534e]")}
            >
              {t.label}
              <span className={cn("text-xs tabular-nums", current === t.key ? "text-white/70" : "text-warm-gray")}>{t.count}</span>
            </Link>
          ))}
        </nav>
      </header>

      {current === "transport" ? (
        <Transport campId={camp.id} people={people} days={days} />
      ) : current === "unanswered" ? (
        <Section title="Haven't said yet" campId={camp.id} rows={unanswered} empty="Everyone has answered." showWhen={false} />
      ) : (
        <DayView campId={camp.id} date={current} dayName={days.find((d) => d.date === current)?.name ?? ""} people={people.filter((p) => p.arrival_day === current)} />
      )}
    </div>
  );
}

function DayView({ campId, date, dayName, people }: { campId: string; date: string; dayName: string; people: ArrivalPerson[] }) {
  const sunday = date && new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[15px] text-warm-gray">
        {people.length} {people.length === 1 ? "person is" : "people are"} arriving on {dayName}. {people.filter((p) => p.checked_in_at).length} checked in.
        {sunday ? " No bus on Sunday." : ""}
      </p>
      {(ARRIVAL_TIMES as readonly ArrivalTime[]).map((t) => {
        const rows = people.filter((p) => p.arrival_time === t);
        if (!rows.length && sunday && t !== "morning") return null;
        return <Section key={t} title={TIME_WORDS[t]} campId={campId} rows={rows} empty="Nobody yet." showWhen={false} showHow />;
      })}
    </div>
  );
}

function Transport({ campId, people, days }: { campId: string; people: ArrivalPerson[]; days: { date: string; name: string }[] }) {
  const group = (transport: "bus" | "self") => people.filter((p) => p.transport === transport);
  const bus = group("bus");
  const self = group("self");
  return (
    <div className="flex flex-col gap-6">
      {[
        { title: "By bus", icon: Bus, rows: bus },
        { title: "By themselves", icon: Footprints, rows: self },
      ].map(({ title, icon: Icon, rows }) => (
        <section key={title} className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-[17px] font-medium">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" /> {title}
            <span className="text-sm font-normal text-warm-gray">{rows.length}</span>
          </h2>
          {days.map((d) => {
            const day = rows.filter((p) => p.arrival_day === d.date);
            return day.length ? <Section key={d.date} title={d.name} campId={campId} rows={day} empty="" showWhen={false} showHow={false} showTime /> : null;
          })}
          {rows.length === 0 && <p className="text-sm text-warm-gray">Nobody yet.</p>}
        </section>
      ))}
    </div>
  );
}

/** A list of people. Checked-in people are highlighted. */
function Section({
  title,
  rows,
  empty,
  showHow = false,
  showTime = false,
}: {
  title: string;
  campId?: string;
  rows: ArrivalPerson[];
  empty: string;
  showWhen?: boolean;
  showHow?: boolean;
  showTime?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        {title} <span className="font-normal text-warm-gray">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        empty ? <p className="text-sm text-warm-gray">{empty}</p> : null
      ) : (
        <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
          {rows.map((p) => (
            <li key={p.id} className={cn("border-t border-stone-border first:border-t-0", p.checked_in_at && "bg-st-paid/10")}>
              <PersonLink id={p.id} className="cm-row flex min-h-12 items-center gap-3 px-4 text-sm">
                <span className="flex-1 font-medium">{p.full_name}</span>
                <span className="text-warm-gray">{p.fellowship}</span>
                {showHow && p.transport && <span className="text-warm-gray">{p.transport === "bus" ? "Bus" : "Own way"}</span>}
                {showTime && p.arrival_time && <span className="text-warm-gray">{TIME_WORDS[p.arrival_time]}</span>}
                {p.checked_in_at && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-st-paid/15 px-2 py-0.5 text-xs font-medium text-st-paid">
                    <Check className="h-3 w-3" strokeWidth={2.4} aria-hidden="true" /> Checked in
                  </span>
                )}
              </PersonLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
