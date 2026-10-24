import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, BedDouble, DoorOpen, Settings, Users } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatCedis } from "@/lib/camp/money";
import { getDashboard, type Breakdown } from "@/lib/camp/reports";
import { GROUP_STATE_LABELS, REGISTRATION_STATUSES, REGISTRATION_STATUS_LABELS } from "@/lib/camp/types";
import { Card, STATUS_STYLES, formatDate, secondaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../access";

const Stat = ({ label, value, href, tone }: { label: string; value: string | number; href?: string; tone?: string }) => {
  const body = (
    <>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cn("mt-1 whitespace-nowrap text-lg font-semibold tabular-nums", tone)}>{value}</dd>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg p-2 hover:bg-slate-50">
      {body}
    </Link>
  ) : (
    <div className="p-2">{body}</div>
  );
};

function BreakdownTable({ rows, label, peopleHref }: { rows: Breakdown[]; label: string; peopleHref: (name: string) => string }) {
  if (!rows.length) return <p className="text-sm text-slate-500">No registrations yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-1 pr-3 font-medium">{label}</th>
            <th className="py-1 pr-3 text-right font-medium">Registered</th>
            <th className="py-1 pr-3 text-right font-medium">Partly paid</th>
            <th className="py-1 pr-3 text-right font-medium">Fully paid</th>
            <th className="py-1 text-right font-medium">Cancelled</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="py-1 pr-3">
                <Link href={peopleHref(r.name)} className="hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="py-1 pr-3 text-right">{r.registered}</td>
              <td className="py-1 pr-3 text-right">{r.partially_paid}</td>
              <td className="py-1 pr-3 text-right">{r.fully_paid}</td>
              <td className="py-1 text-right text-slate-400">{r.cancelled}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const total = REGISTRATION_STATUSES.reduce((sum, s) => sum + d.status[s], 0);
  const percent = d.money.expected ? Math.round((d.money.collected / d.money.expected) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/camp" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Camps
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{camp.name}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[camp.status]}`}>
                {camp.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {formatDate(camp.starts_on)} – {formatDate(camp.ends_on)} · payment due {formatDate(camp.payment_due_on)} ·
              roommates by {formatDate(camp.roommate_deadline_on)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={people} className={secondaryButtonClass}>
              <Users className="h-4 w-4" /> People ({total})
            </Link>
            <Link href={`/admin/camp/${camp.id}/rooms`} className={secondaryButtonClass}>
              <BedDouble className="h-4 w-4" /> Rooms
            </Link>
            <Link href={`/admin/camp/${camp.id}/assign`} className={secondaryButtonClass}>
              <DoorOpen className="h-4 w-4" /> Assign rooms
            </Link>
            <Link href={`/admin/camp/${camp.id}/settings`} className={secondaryButtonClass}>
              <Settings className="h-4 w-4" /> Settings
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Registration">
          <dl className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {REGISTRATION_STATUSES.map((s) => (
              <Stat key={s} label={REGISTRATION_STATUS_LABELS[s]} value={d.status[s]} href={`${people}?status=${s}`} />
            ))}
          </dl>
          {d.pastDue > 0 && (
            <p className="mt-3 flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4" /> {d.pastDue} past the payment due date with a balance.
            </p>
          )}
        </Card>

        <Card title="Money">
          <dl className="grid grid-cols-3 gap-1">
            <Stat label="Collected" value={formatCedis(d.money.collected)} tone="text-emerald-700" />
            <Stat label="Expected" value={formatCedis(d.money.expected)} />
            <Stat label="Outstanding" value={formatCedis(d.money.outstanding)} tone={d.money.outstanding ? "text-amber-700" : undefined} />
          </dl>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            <p>{percent}% of expected. Fees attendees paid to Paystack: {formatCedis(d.money.fees)} (not counted above).</p>
            {d.money.paidByCancelled > 0 && (
              <p>Paid by cancelled registrations (refund in Paystack): {formatCedis(d.money.paidByCancelled)}</p>
            )}
            {d.money.flagged > 0 && (
              <Link href={people} className="flex items-center gap-1 text-amber-700 hover:underline">
                <AlertTriangle className="h-3 w-3" /> {d.money.flagged} payment(s) to look at
              </Link>
            )}
          </div>
        </Card>
      </div>

      <Card title="Rooms: supply and demand">
        {d.supply.length === 0 ? (
          <p className="text-sm text-slate-500">No registrations or rooms yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Room type</th>
                  <th className="py-1 pr-3 text-right font-medium">Registered</th>
                  <th className="py-1 pr-3 text-right font-medium">Fully paid</th>
                  <th className="py-1 pr-3 text-right font-medium">Beds</th>
                  <th className="py-1 pr-3 text-right font-medium">Placed</th>
                  <th className="py-1 text-right font-medium">Free beds</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {d.supply.map((s) => {
                  const short = s.registered > s.beds;
                  return (
                    <tr key={`${s.room_type_id}.${s.gender}`}>
                      <td className="py-1 pr-3">
                        {s.gender === "male" ? "Men" : "Women"} · {s.room_type_name}
                      </td>
                      <td className="py-1 pr-3 text-right">{s.registered}</td>
                      <td className="py-1 pr-3 text-right">{s.fully_paid}</td>
                      <td className={cn("py-1 pr-3 text-right", short && "font-semibold text-red-700")}>
                        {s.beds}
                        {short && <span className="ml-1 text-xs font-normal">({s.registered - s.beds} short)</span>}
                      </td>
                      <td className="py-1 pr-3 text-right">{s.placed}</td>
                      <td className="py-1 text-right">{s.beds - s.placed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Allocation">
        <dl className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Placed in a room" value={d.allocation.placed} href={`${people}?room=placed`} />
          <Stat label="Waiting for a room" value={d.allocation.waiting} href={`${people}?room=waiting`} />
          <Stat label="Unmatched" value={d.allocation.unmatched} href={`${people}?roommate=unmatched`} />
          {(["open", "locked", "final"] as const).map((s) => (
            <Stat key={s} label={`Groups ${GROUP_STATE_LABELS[s].toLowerCase()}`} value={d.allocation.groups[s]} />
          ))}
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By fellowship">
          <BreakdownTable rows={d.byFellowship} label="Fellowship" peopleHref={(n) => `${people}?fellowship=${encodeURIComponent(n)}`} />
        </Card>
        <div className="space-y-6">
          <Card title="By PFCC">
            <BreakdownTable rows={d.byPfcc} label="PFCC" peopleHref={(n) => `${people}?pfcc=${encodeURIComponent(n)}`} />
          </Card>
          <Card title="By church">
            <BreakdownTable rows={d.byChurch} label="Church" peopleHref={(n) => `${people}?church=${encodeURIComponent(n)}`} />
          </Card>
        </div>
      </div>

      <Card title="Recent activity">
        {d.activity.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {d.activity.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-3 text-slate-600">
                <span className="font-mono text-xs text-slate-400">{entry.created_at.slice(0, 16).replace("T", " ")}</span>
                <span className="font-medium text-slate-800">{entry.action}</span>
                <span>{entry.actor}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
