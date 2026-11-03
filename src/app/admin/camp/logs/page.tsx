import Link from "next/link";
import { CircleAlert, Clock, KeyRound, LogIn, LogOut, Pencil } from "lucide-react";
import { listCamps } from "@/lib/camp/camps";
import { actorName, describeAction } from "@/lib/camp/history-words";
import { ACCESS_WORDS, listLogs, type AccessEvent, type AccessRole, type LogKind } from "@/lib/camp/logs";
import { AdminPage } from "@/components/camp/AdminPage";
import { UrlFilters } from "@/components/camp/UrlFilters";
import { secondaryButtonClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../access";

const ROLES: [AccessRole, string][] = [
  ["attendee", "Attendees"],
  ["leader", "Leaders"],
  ["coordinator", "Coordinators"],
  ["visitor", "Not signed in"],
];
const ROLE_WORD: Record<string, string> = { attendee: "Attendee", leader: "Leader", coordinator: "Coordinator", admin: "Admin", visitor: "Not signed in" };

const at = (iso: string) => new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
const dayOf = (iso: string) => {
  const d = at(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" });
  const today = new Date().toLocaleDateString("en-GB", { timeZone: "Africa/Accra" });
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" });
  return d === today ? "Today" : d === yesterday ? "Yesterday" : at(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" });
};

const iconFor = (kind: string, event: string, ok: number) =>
  !ok ? CircleAlert : kind === "change" ? Pencil : event === "sign_in" ? LogIn : event === "sign_out" ? LogOut : KeyRound;

/** Logs: every sign-in and every change, across all camps, newest first. Admins only. */
export default async function LogsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await pageStaff("admin");
  if (!me) return <NoAccess />;
  const q = await searchParams;
  const kind = q.kind === "sign-ins" || q.kind === "changes" ? (q.kind as LogKind) : undefined;
  const role = ROLES.some(([r]) => r === q.role) ? (q.role as AccessRole) : undefined;
  const days = [1, 7, 30, 90].includes(Number(q.when)) ? Number(q.when) : undefined;
  const camps = await listCamps();
  const camp = camps.some((c) => c.id === q.camp) ? q.camp : undefined;
  const { entries, next } = await listLogs({ kind, role, days, camp, who: q.who?.slice(0, 120) || undefined, before: q.before || undefined });

  const groups: { day: string; entries: typeof entries }[] = [];
  for (const e of entries) {
    const day = dayOf(e.created_at);
    if (groups.at(-1)?.day !== day) groups.push({ day, entries: [] });
    groups.at(-1)!.entries.push(e);
  }
  const more = next ? `?${new URLSearchParams({ ...q, before: next })}` : null;

  return (
    <AdminPage
      email={me.email}
      tab="logs"
      title={
        <>
          <span className="text-cyan-edge">Logs</span>
        </>
      }
      lead="Every sign-in and every change, in all camps. Sign-ins are kept for 90 days; changes stay in each camp's History."
    >
      <UrlFilters
        filters={[
          { key: "kind", label: "What", options: [["", "Sign-ins and changes"], ["sign-ins", "Sign-ins only"], ["changes", "Changes only"]] },
          { key: "role", label: "Who", options: [["", "Everyone"], ...ROLES] },
          { key: "camp", label: "Camp", options: [["", "All camps"], ...camps.map((c) => [c.id, c.name] as [string, string])] },
          { key: "when", label: "When", options: [["", "Any time"], ["1", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"]] },
        ]}
      />
      {q.who && (
        <p className="text-sm">
          Only <strong className="font-medium">{q.who}</strong> ·{" "}
          <Link href={`?${new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([k]) => k !== "who" && k !== "before")))}`} className="underline underline-offset-[3px]">
            show everyone
          </Link>
        </p>
      )}
      {entries.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white px-4 py-3.5 text-[15px] text-warm-gray">Nothing here.</p>
      ) : (
        <section className="rounded-[10px] border border-stone-border bg-white px-4 pb-2 shadow-seline-card sm:px-5">
          {groups.map((g) => (
            <div key={g.day}>
              <h2 className="pb-2 pt-4 text-[13px] font-semibold">{g.day}</h2>
              <ol>
                {g.entries.map((e) => {
                  const Icon = iconFor(e.kind, e.event, e.ok);
                  const who = e.actor === "visitor" ? "Someone not signed in" : actorName(e.actor, e.person);
                  const what = e.kind === "change" ? describeAction(e.event) : (ACCESS_WORDS[e.event as AccessEvent] ?? e.event.replace(/_/g, " "));
                  return (
                    <li key={e.key} className="flex items-start gap-3 border-t border-stone-border py-3 text-sm">
                      <Icon className={`mt-0.5 h-[17px] w-[17px] flex-none ${e.ok ? "" : "text-st-none"}`} strokeWidth={1.6} aria-hidden="true" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span>
                          {e.actor === "visitor" ? (
                            <strong className="font-medium">{who}</strong>
                          ) : (
                            <Link href={`?${new URLSearchParams({ who: e.actor })}`} className="font-medium hover:underline">
                              {who}
                            </Link>
                          )}{" "}
                          {what}
                          {!e.ok && <span> · didn&apos;t work</span>}
                          {e.kind === "change" && e.person && !e.actor.startsWith("attendee:") && <span className="text-[#57534e]"> · {e.person}</span>}
                        </span>
                        <span className="text-[13px] text-warm-gray">
                          {[e.role ? ROLE_WORD[e.role] : "", e.camp_name, e.place, e.device].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <time dateTime={at(e.created_at).toISOString()} className="flex items-center gap-1 text-[13px] tabular-nums text-warm-gray">
                        <Clock className="h-3 w-3 max-sm:hidden" strokeWidth={1.8} aria-hidden="true" />
                        {at(e.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" })}
                      </time>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </section>
      )}
      {more && (
        <Link href={more} className={`${secondaryButtonClass} self-center`}>
          Show older
        </Link>
      )}
    </AdminPage>
  );
}
