import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { getPoolBoard, listPools } from "@/lib/camp/assignments";
import { getCamp, ID } from "@/lib/camp/camps";
import { formatGroupCode } from "@/lib/camp/codes";
import { GENDERS, GROUP_STATE_LABELS, type Gender, type Pool } from "@/lib/camp/types";
import { Card } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../../access";
import { AssignPicker, Notices, RemoveFromRoom, type RoomOption } from "./AssignControls";

const poolKey = (p: Pick<Pool, "room_type_id" | "gender">) => `${p.room_type_id}.${p.gender}`;
const poolName = (p: Pool) => `${p.gender === "male" ? "Men" : "Women"} · ${p.room_type_name}`;

const STATE_STYLES = {
  open: "bg-emerald-50 text-emerald-700",
  locked: "bg-amber-50 text-amber-700",
  final: "bg-slate-100 text-slate-600",
} as const;

/** One pool (gender and room type) at a time: everyone in it can share any of its rooms. */
export default async function AssignPage({
  params,
  searchParams,
}: {
  params: Promise<{ campId: string }>;
  searchParams: Promise<{ pool?: string }>;
}) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const [camp, pools] = await Promise.all([getCamp(campId), listPools(campId)]);
  if (!camp) notFound();

  const { pool: wanted } = await searchParams;
  const pool = pools.find((p) => poolKey(p) === wanted) ?? pools[0];
  const board =
    pool && GENDERS.includes(pool.gender) ? await getPoolBoard(camp.id, pool.room_type_id, pool.gender as Gender) : null;

  const options: RoomOption[] =
    board?.rooms.map((r) => ({ id: r.id, label: r.label, free: r.capacity - r.occupied })) ?? [];
  const mostFree = Math.max(0, ...options.map((o) => o.free));
  const waiting = pool ? pool.fully_paid - pool.assigned : 0;
  const freeBeds = pool ? pool.beds - pool.assigned : 0;
  const tooBig = board?.groups.filter((g) => g.members.filter((m) => !m.room_label).length > mostFree) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/camp/${camp.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {camp.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Assign rooms</h1>
        <p className="mt-1 text-sm text-slate-500">
          Only Fully Paid people can be placed, in rooms of their gender and room type.
        </p>
      </div>

      {pools.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Nobody is fully paid yet, and there are no rooms.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {pools.map((p) => (
            <Link
              key={poolKey(p)}
              href={`?pool=${poolKey(p)}`}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                p === pool ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:bg-slate-50",
              )}
            >
              <span className="font-medium">{poolName(p)}</span>
              <span className={p === pool ? "text-slate-300" : "text-slate-500"}>
                {" "}
                · {p.assigned} of {p.fully_paid} placed · {p.beds} beds
              </span>
            </Link>
          ))}
        </div>
      )}

      {pool && board && (
        // Keyed by pool, so a warning from one pool isn't left showing on another.
        <Notices key={poolKey(pool)}>
          {(waiting > freeBeds || tooBig.length > 0) && (
            <div className="mb-4 space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {waiting > freeBeds && (
                <p className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Short of beds: {waiting} waiting, {freeBeds} free.
                </p>
              )}
              {tooBig.map((g) => (
                <p key={g.id} className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Group {formatGroupCode(g.code)} needs{" "}
                  {g.members.filter((m) => !m.room_label).length} beds together; no room has that many free.
                </p>
              ))}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <Card title={`Groups waiting (${board.groups.length})`}>
                {board.groups.length === 0 ? (
                  <p className="text-sm text-slate-500">No groups waiting.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {board.groups.map((g) => {
                      const unplaced = g.members.filter((m) => !m.room_label).length;
                      return (
                        <li key={g.id} className="space-y-2 py-3">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-mono">{formatGroupCode(g.code)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLES[g.state]}`}>
                              {GROUP_STATE_LABELS[g.state]}
                            </span>
                            <span className="text-slate-500">
                              {g.members.length} of {g.capacity}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600">
                            {g.members.map((m, i) => (
                              <span key={m.registration_id}>
                                {i > 0 && ", "}
                                {m.full_name}
                                {m.room_label && <span className="text-slate-400"> ({m.room_label})</span>}
                              </span>
                            ))}
                          </p>
                          {g.state === "open" && (
                            <p className="text-xs text-amber-700">Still open: its members may change.</p>
                          )}
                          <AssignPicker kind="group" id={g.id} need={unplaced} rooms={options} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card title={`Unmatched people (${board.people.length})`}>
                {board.people.length === 0 ? (
                  <p className="text-sm text-slate-500">Nobody unmatched.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {board.people.map((p) => (
                      <li key={p.id} className="space-y-2 py-3">
                        <p className="text-sm">
                          <span className="font-medium">{p.full_name}</span>
                          <span className="text-slate-500"> · {p.fellowship}</span>
                        </p>
                        <AssignPicker kind="person" id={p.id} need={1} rooms={options} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <Card title={`Rooms (${board.rooms.length})`}>
              {board.rooms.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No {poolName(pool).toLowerCase()} rooms yet.{" "}
                  <Link href={`/admin/camp/${camp.id}/rooms`} className="underline">
                    Add rooms
                  </Link>
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {board.rooms.map((r) => (
                    <li key={r.id} className="py-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{r.label}</span>
                        <span
                          className={cn(
                            "tabular-nums",
                            r.occupied === r.capacity ? "text-emerald-700" : r.occupied ? "text-amber-700" : "text-slate-500",
                          )}
                        >
                          {r.occupied} of {r.capacity}
                        </span>
                      </div>
                      {r.occupants.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {r.occupants.map((o) => (
                            <li key={o.registration_id} className="flex items-center justify-between gap-2 text-sm text-slate-600">
                              <span>
                                {o.full_name}
                                {o.group_code && (
                                  <span className="ml-2 font-mono text-xs text-slate-400">{formatGroupCode(o.group_code)}</span>
                                )}
                              </span>
                              <RemoveFromRoom registrationId={o.registration_id} name={o.full_name} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </Notices>
      )}
    </div>
  );
}
