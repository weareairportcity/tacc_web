import Link from "next/link";
import { Bell, BedDouble, CalendarClock, CircleAlert, CreditCard, Inbox, MessageSquare, UserPlus, type LucideIcon } from "lucide-react";
import type { InboxItem } from "@/lib/camp/inbox";
import { cn } from "@/lib/utils";

const ICON: Record<string, LucideIcon> = {
  registration: UserPlus,
  payment: CreditCard,
  payment_received: CreditCard,
  payment_failed: CircleAlert,
  payment_problem: CircleAlert,
  request: Inbox,
  request_answered: Inbox,
  room_ready: BedDouble,
  due_soon: CalendarClock,
  camp_tomorrow: CalendarClock,
  messages: MessageSquare,
};

const stamp = (iso: string) => Date.parse(iso.endsWith("Z") ? iso : `${iso.replace(" ", "T")}Z`);
const ghanaDay = (t: number) => new Date(t).toISOString().slice(0, 10); // Ghana is UTC+0

/** Today (in Ghana) first, then Earlier; empty sections left out. */
function bySection(items: InboxItem[]) {
  const today = ghanaDay(Date.now());
  return [
    { title: "Today", rows: items.filter((i) => ghanaDay(stamp(i.created_at)) === today) },
    { title: "Earlier", rows: items.filter((i) => ghanaDay(stamp(i.created_at)) !== today) },
  ].filter((s) => s.rows.length);
}

function ago(t: number) {
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Accra" });
}

/**
 * Notifications, newest first, Today then Earlier. Each opens where it
 * pointed when it was sent. Ones new since the last visit get the cyan dot
 * (the page marks them read once shown, and the dot stays for this visit).
 */
export function InboxList({ items }: { items: InboxItem[] }) {
  if (!items.length)
    return (
      <div className="flex flex-col items-center gap-2 rounded-[10px] border border-stone-border bg-white p-8 text-center">
        <Bell className="h-6 w-6 text-ash-gray" strokeWidth={1.5} aria-hidden="true" />
        <p className="text-[15px] font-medium">Nothing yet</p>
        <p className="text-sm text-warm-gray">Updates sent to your phone show up here too, so you can open them later.</p>
      </div>
    );
  const sections = bySection(items);

  return (
    <div className="flex flex-col gap-5">
      {sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium text-warm-gray">{s.title}</h2>
          <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
            {s.rows.map((i) => {
              const Icon = ICON[i.kind] ?? Bell;
              const unread = !i.read_at;
              return (
                <li key={i.id} className="border-t border-stone-border first:border-t-0">
                  <Link href={i.url} className="cm-row flex min-h-[64px] items-start gap-3.5 px-4 py-3">
                    <span className={cn("mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full", unread ? "bg-sky-wash text-ink-black" : "bg-stone-canvas text-[#57534e]")}>
                      <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-baseline gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-[15px]", unread ? "font-semibold" : "font-medium")}>{i.title}</span>
                        <time dateTime={i.created_at} className="flex-none text-[12px] tabular-nums text-warm-gray">
                          {ago(stamp(i.created_at))}
                        </time>
                        {unread && (
                          <span className="h-2 w-2 flex-none self-center rounded-full bg-cyan-signal">
                            <span className="sr-only">New</span>
                          </span>
                        )}
                      </span>
                      <span className="line-clamp-2 text-[14px] leading-snug text-[#57534e]">{i.body}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
