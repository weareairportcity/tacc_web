import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowUpRight, BedDouble, CircleCheck, CircleSlash, Clock, Download, User, Users } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatGroupCode } from "@/lib/camp/codes";
import { formatCedis } from "@/lib/camp/money";
import { daysUntil, registrationPhase } from "@/lib/camp/registrations";
import { getDashboard, type Breakdown } from "@/lib/camp/reports";
import { Card, StatusLine, formatDate, headlineClass, secondaryButtonClass, titleClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../access";

/** Plain words for the audit log's action codes. */
const ACTION_WORDS: Record<string, string> = {
  "camp.create": "created the camp",
  "camp.update": "edited camp settings",
  "registration.create": "registered",
  "registration.cancel": "cancelled a registration",
  "registration.code_reset": "asked for a new sign-in code",
  "registration.refund": "recorded a refund",
  "registration.room_type_change": "changed someone's room type",
  "payment.success": "confirmed a payment",
  "payment.flagged": "flagged a payment to look at",
  "group.create": "started a roommate group",
  "group.invite": "invited someone to a group",
  "group.invite_cancel": "withdrew an invite",
  "group.invite_decline": "declined an invite",
  "group.join": "joined a group",
  "group.leave": "left a group",
  "group.remove": "removed someone from a group",
  "group.lock": "locked a group",
  "group.unlock": "unlocked a group",
  "room.assign": "placed someone in a room",
  "room.assign_group": "placed a group in a room",
  "room.unassign": "took someone out of a room",
  "room.create": "added a room",
  "room.update": "edited a room",
  "room.delete": "deleted a room",
  "room.import": "imported rooms",
  "room.sms": "texted people their rooms",
  "room_type.create": "added a room type",
  "room_type.update": "edited a room type",
  "room_type.delete": "deleted a room type",
  "room_type.places_left": "updated places left",
};

const who = (actor: string) => (actor.startsWith("attendee:") ? "An attendee" : actor === "paystack" ? "Paystack" : actor.startsWith("system") ? "Commune" : actor.split("@")[0]);

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

const SEGMENTS = [
  { key: "fully_paid", label: "Fully paid", color: "bg-soot" },
  { key: "partially_paid", label: "Part paid", color: "bg-warm-gray" },
  { key: "registered", label: "Registered, nothing paid", color: "bg-stone-muted" },
  { key: "cancelled", label: "Cancelled", color: "bg-stone-border" },
] as const;

function StackedBar({ row }: { row: Breakdown }) {
  return (
    <span className="flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      {SEGMENTS.slice(0, 3).map((s) => (row[s.key] > 0 ? <span key={s.key} className={s.color} style={{ flex: row[s.key] }} /> : null))}
    </span>
  );
}

function BreakdownList({ rows, peopleHref }: { rows: Breakdown[]; peopleHref: (name: string) => string }) {
  if (!rows.length) return <p className="text-sm text-warm-gray">No registrations yet.</p>;
  return (
    <ul className="grid gap-x-8 text-sm tabular-nums sm:grid-cols-2">
      {rows.map((r) => {
        const live = r.registered + r.partially_paid + r.fully_paid;
        return (
          <li key={r.name} className="border-b border-stone-border">
            <Link href={peopleHref(r.name)} className="cm-row flex items-center gap-3 py-2.5" title={`${r.fully_paid} fully paid, ${r.partially_paid} part paid, ${r.registered} nothing paid`}>
              <span className="w-28 truncate">{r.name}</span>
              <StackedBar row={r} />
              <span className="w-8 text-right">{live}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The coordinator dashboard. Leaders are sent to their own read-only list. */
export default async function CampDashboard({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator", "leader");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  if (staff.role === "leader") redirect(`/admin/camp/${campId}/people`);

  const [camp, d] = await Promise.all([getCamp(campId), getDashboard(campId)]);
  if (!camp) notFound();

  const people = `/admin/camp/${camp.id}/registrations`;
  const live = d.status.registered + d.status.partially_paid + d.status.fully_paid;
  const percent = d.money.expected ? Math.round((d.money.collected / d.money.expected) * 100) : 0;
  const owing = d.status.registered + d.status.partially_paid;
  const phase = registrationPhase(camp);
  const short = d.supply.filter((s) => s.registered > s.beds);

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          {camp.status === "draft" ? (
            <StatusLine icon={CircleSlash} strong="Draft">only coordinators can see it</StatusLine>
          ) : phase === "open" ? (
            <StatusLine dot="live" strong="Registration open">
              closes in {daysUntil(camp.registration_closes_on)} days · payment due {formatDate(camp.payment_due_on)} · roommates by{" "}
              {formatDate(camp.roommate_deadline_on)}
            </StatusLine>
          ) : phase === "upcoming" ? (
            <StatusLine icon={Clock} strong={`Registration opens ${formatDate(camp.registration_opens_on)}`}>
              in {daysUntil(camp.registration_opens_on)} days
            </StatusLine>
          ) : (
            <StatusLine icon={Clock} strong="Registration closed">
              payment due {formatDate(camp.payment_due_on)}
            </StatusLine>
          )}
          <h1 className={headlineClass}>{camp.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/admin/camp/${camp.id}/registrations/export`} className={secondaryButtonClass}>
            <Download className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Export CSV
          </a>
          <Link href={`/camps/${camp.slug}`} target="_blank" className={secondaryButtonClass}>
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Public page
          </Link>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card lifted title="Money" className="cm-rise">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-[44px] leading-none tracking-[-0.026em] tabular-nums">{formatCedis(d.money.collected)}</span>
            <span className="text-sm text-warm-gray">collected of {formatCedis(d.money.expected)} expected</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-border" role="img" aria-label={`${percent}% collected`}>
            <div className="cm-grow h-full rounded-full bg-soot" style={{ width: `${percent}%` }} />
          </div>
          <dl className="grid grid-cols-3 gap-3 text-[13px] tabular-nums">
            <div className="flex flex-col gap-0.5">
              <dt className="text-warm-gray">Still owed</dt>
              <dd className="text-base font-medium">{formatCedis(d.money.outstanding)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-warm-gray">To refund</dt>
              <dd className="text-base font-medium">{formatCedis(d.money.paidByCancelled)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-warm-gray">Refunded</dt>
              <dd className="text-base font-medium">{formatCedis(d.money.refunded)}</dd>
            </div>
          </dl>
          <div className="flex flex-col gap-2 border-t border-stone-border pt-3.5 text-[13px]">
            <Link href={`/admin/camp/${camp.id}/reconcile`} className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Check against Paystack
            </Link>
            {d.money.flagged > 0 && (
              <Link href={people} className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> {d.money.flagged} payment
                {d.money.flagged === 1 ? "" : "s"} to look at
              </Link>
            )}
            <span className="text-warm-gray">Paystack fees paid by attendees: {formatCedis(d.money.fees)} (not counted above)</span>
          </div>
        </Card>

        <Card title={`${live} ${live === 1 ? "person" : "people"}`} className="cm-rise" >
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={SEGMENTS.map((s) => `${d.status[s.key]} ${s.label.toLowerCase()}`).join(", ")}>
            {SEGMENTS.map((s) => (d.status[s.key] > 0 ? <span key={s.key} className={cn("cm-grow", s.color)} style={{ flex: d.status[s.key] }} /> : null))}
            {live + d.status.cancelled === 0 && <span className="flex-1 bg-stone-border" />}
          </div>
          <ul className="flex flex-col text-sm tabular-nums">
            {SEGMENTS.map((s) => (
              <li key={s.key} className="border-b border-stone-border last:border-b-0">
                <Link href={`${people}?status=${s.key}`} className="cm-row flex items-center gap-2.5 py-2.5">
                  <span className={cn("h-2.5 w-2.5 rounded-[3px]", s.color)} />
                  <span className={cn("flex-1", s.key === "cancelled" && "text-warm-gray")}>{s.label}</span>
                  <span className={s.key === "cancelled" ? "text-warm-gray" : "font-medium"}>{d.status[s.key]}</span>
                </Link>
              </li>
            ))}
          </ul>
          {owing > 0 && (
            <Link href={`${people}?status=partially_paid`} className="flex items-center gap-2 text-[13px]">
              <Clock className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
              {owing} still owe money
              {todayBefore(camp.payment_due_on) ? ` with ${daysUntil(camp.payment_due_on)} days to go` : ""}
              {d.pastDue > 0 && ` · ${d.pastDue} past the due date`}
            </Link>
          )}
        </Card>
      </div>

      <Card
        title="Beds against people"
        action={
          short.length > 0 ? (
            <span className="flex items-center gap-1.5 text-[13px]">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> {short.length} room type
              {short.length === 1 ? "" : "s"} short of beds
            </span>
          ) : null
        }
      >
        {d.supply.length === 0 ? (
          <p className="text-sm text-warm-gray">No registrations or rooms yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm tabular-nums">
              <thead className="text-left text-xs text-warm-gray">
                <tr>
                  <th className="pb-2.5 pr-3 font-medium">Room type</th>
                  <th className="px-3 pb-2.5 font-medium">People</th>
                  <th className="px-3 pb-2.5 font-medium">Taking registrations</th>
                  <th className="w-[32%] px-3 pb-2.5 font-medium">Placed of beds</th>
                  <th className="pb-2.5 pl-3 text-right font-medium">Free beds</th>
                </tr>
              </thead>
              <tbody>
                {d.supply.map((s) => {
                  const isShort = s.registered > s.beds;
                  return (
                    <tr key={`${s.room_type_id}.${s.gender}`} className="border-t border-stone-border">
                      <td className="py-3 pr-3">
                        {s.gender === "male" ? "Men" : "Women"} · {s.room_type_name}
                      </td>
                      <td className={cn("px-3 py-3", isShort && "font-semibold")}>{s.registered}</td>
                      <td className="px-3 py-3">
                        {s.places_left === null ? (
                          <span className="text-warm-gray">No limit</span>
                        ) : s.places_left === 0 ? (
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <CircleSlash className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" /> Full
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <span className="h-[7px] w-[7px] rounded-full bg-cyan-signal" /> {s.places_left} left
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2.5">
                          <span className="block h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-stone-border">
                            <span className="cm-grow block h-full bg-soot" style={{ width: `${s.beds ? Math.round((s.placed / s.beds) * 100) : 0}%` }} />
                          </span>
                          <span className="text-[13px] text-warm-gray">
                            {s.placed} / {s.beds}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 pl-3 text-right">
                        {isShort ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" /> {s.registered - s.beds} short
                          </span>
                        ) : (
                          s.beds - s.placed
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Link href={`/admin/camp/${camp.id}/rooms`} className="text-[13px] text-warm-gray underline decoration-stone-muted underline-offset-[3px] hover:text-ink-black">
          Set places left or add rooms on Rooms
        </Link>
      </Card>

      {d.groupsTooBig.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-stone-border bg-white p-4 text-sm">
          {d.groupsTooBig.map((g) => (
            <p key={g.code} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.7} aria-hidden="true" />
              Group {formatGroupCode(g.code)} ({g.gender === "male" ? "men" : "women"}, {g.room_type_name}) needs {g.needs} beds together.
              The most free in one room is {g.most_free}.
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Rooms and groups">
          <ul className="flex flex-col text-sm tabular-nums">
            {[
              { icon: BedDouble, label: "Placed in a room", value: d.allocation.placed, href: `${people}?room=placed` },
              { icon: Clock, label: "Fully paid, waiting for a room", value: d.allocation.waiting, href: `/admin/camp/${camp.id}/assign` },
              { icon: User, label: "Fully paid, no group yet", value: d.allocation.unmatched, href: `${people}?roommate=unmatched` },
            ].map(({ icon: Icon, label, value, href }) => (
              <li key={label} className="border-b border-stone-border">
                <Link href={href} className="cm-row flex items-center gap-3 py-3">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  <span className="font-medium">{value}</span>
                </Link>
              </li>
            ))}
            <li className="flex items-center gap-3 py-3">
              <Users className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
              <span className="flex-1">Groups</span>
              <span className="text-warm-gray">
                {d.allocation.groups.open} open · {d.allocation.groups.locked} locked · {d.allocation.groups.final} final
              </span>
            </li>
          </ul>
        </Card>

        <Card title="Recent activity">
          {d.activity.length === 0 ? (
            <p className="text-sm text-warm-gray">Nothing yet.</p>
          ) : (
            <ol className="flex flex-col text-sm">
              {d.activity.slice(0, 8).map((entry) => (
                <li key={entry.id} className="flex gap-3 border-b border-stone-border py-2.5 last:border-b-0">
                  <span className="flex-1">
                    <span className="font-medium">{who(entry.actor)}</span> {ACTION_WORDS[entry.action] ?? entry.action.replace(/[._]/g, " ")}
                  </span>
                  <span className="text-[13px] text-warm-gray">{ago(entry.created_at.endsWith("Z") ? entry.created_at : `${entry.created_at}Z`)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card title="By fellowship">
        <BreakdownList rows={d.byFellowship} peopleHref={(n) => `${people}?fellowship=${encodeURIComponent(n)}`} />
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="By PFCC">
          <BreakdownList rows={d.byPfcc} peopleHref={(n) => `${people}?pfcc=${encodeURIComponent(n)}`} />
        </Card>
        <Card title="By church">
          <BreakdownList rows={d.byChurch} peopleHref={(n) => `${people}?church=${encodeURIComponent(n)}`} />
        </Card>
      </div>
      <p className={`${titleClass} sr-only`}>End of dashboard</p>
    </div>
  );
}

function todayBefore(date: string) {
  return new Date().toISOString().slice(0, 10) <= date;
}
