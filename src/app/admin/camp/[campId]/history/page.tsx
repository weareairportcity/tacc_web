import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, BedDouble, Clock, CreditCard, RotateCcw, Settings, UserRound, Users } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { actorName, describeAction } from "@/lib/camp/history-words";
import { HISTORY_KINDS, historyActors, listHistory, type HistoryKind } from "@/lib/camp/reports";
import { headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { HistoryFilters } from "./HistoryFilters";

const KIND_WORDS: Record<HistoryKind, string> = { money: "Money", people: "People", rooms: "Rooms", groups: "Roommate groups", settings: "Settings" };

const iconFor = (action: string) =>
  action.startsWith("payment.") ? CreditCard
  : action.includes("refund") ? RotateCcw
  : action.includes("room_type_change") || action.startsWith("request.room") ? ArrowLeftRight
  : action.startsWith("room") ? BedDouble
  : action.startsWith("group.") ? Users
  : action.startsWith("camp.") || action.startsWith("staff.") ? Settings
  : UserRound;

const dayOf = (iso: string) => {
  const d = iso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  return d === today ? "Today" : d === yesterday ? "Yesterday" : new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};

/** History: the audit log in plain words, with who, what and when filters. */
export default async function HistoryPage({ params, searchParams }: { params: Promise<{ campId: string }>; searchParams: Promise<Record<string, string>> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const q = await searchParams;
  const kind = (HISTORY_KINDS as readonly string[]).includes(q.what) ? (q.what as HistoryKind) : undefined;
  const days = [1, 7, 30].includes(Number(q.when)) ? Number(q.when) : undefined;
  const before = Number(q.before) > 0 ? Number(q.before) : undefined;
  const [camp, entries, actors] = await Promise.all([getCamp(campId), listHistory(campId, { who: q.who || undefined, kind, days, before }), historyActors(campId)]);
  if (!camp) notFound();

  const groups: { day: string; entries: typeof entries }[] = [];
  for (const e of entries) {
    const day = dayOf(e.created_at.endsWith("Z") ? e.created_at : `${e.created_at}Z`);
    if (groups.at(-1)?.day !== day) groups.push({ day, entries: [] });
    groups.at(-1)!.entries.push(e);
  }
  const more = new URLSearchParams({ ...q, before: String(entries.at(-1)?.id ?? "") });

  return (
    <div className="flex flex-col gap-5">
      <h1 className={`${headlineClass} text-[34px]`}>History</h1>
      <HistoryFilters actors={actors} kinds={HISTORY_KINDS.map((k) => [k, KIND_WORDS[k]])} />
      {entries.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white px-4 py-3.5 text-[15px] text-warm-gray">Nothing here.</p>
      ) : (
        <section className="rounded-[10px] border border-stone-border bg-white px-4 pb-2 shadow-seline-card sm:px-5">
          {groups.map((g) => (
            <div key={g.day}>
              <h2 className="pb-2 pt-4 text-[13px] font-semibold">{g.day}</h2>
              <ol>
                {g.entries.map((e) => {
                  const Icon = iconFor(e.action);
                  const self = e.actor.startsWith("attendee:");
                  return (
                    <li key={e.id} className="flex items-start gap-3 border-t border-stone-border py-3 text-sm">
                      <Icon className="mt-0.5 h-[17px] w-[17px] flex-none" strokeWidth={1.6} aria-hidden="true" />
                      <span className="flex-1">
                        <strong className="font-medium">{actorName(e.actor, e.person)}</strong> {describeAction(e.action)}
                        {!self && e.person && <span className="text-[#57534e]"> · {e.person}</span>}
                      </span>
                      <time dateTime={e.created_at} className="flex items-center gap-1 text-[13px] tabular-nums text-warm-gray">
                        <Clock className="h-3 w-3 max-sm:hidden" strokeWidth={1.8} aria-hidden="true" />
                        {new Date(e.created_at.endsWith("Z") ? e.created_at : `${e.created_at}Z`).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" })}
                      </time>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
          {entries.length === 50 && (
            <Link href={`?${more}`} className="cm-press my-3 inline-flex h-10 items-center rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
              Show older
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
