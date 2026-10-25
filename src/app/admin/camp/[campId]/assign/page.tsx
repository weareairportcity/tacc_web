import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Lock, LockOpen } from "lucide-react";
import { getPoolBoard, listPools } from "@/lib/camp/assignments";
import { getCamp, ID } from "@/lib/camp/camps";
import { listRoomSmsPending } from "@/lib/camp/room-sms";
import { formatGroupCode } from "@/lib/camp/codes";
import { GENDERS, GROUP_STATE_LABELS, type Gender, type Pool } from "@/lib/camp/types";
import { Card, headlineClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { NoAccess, pageStaff } from "../../access";
import { AssignPicker, Notices, RemoveFromRoom, SendRoomSms, type RoomOption } from "./AssignControls";

const poolKey = (p: Pick<Pool, "room_type_id" | "gender">) => `${p.room_type_id}.${p.gender}`;
const poolName = (p: Pool) => `${p.gender === "male" ? "Men" : "Women"} · ${p.room_type_name}`;

// Texting rooms sends one mNotify request per room, a few at a time.
export const maxDuration = 60;

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
  const [camp, pools, smsPending] = await Promise.all([getCamp(campId), listPools(campId), listRoomSmsPending(campId)]);
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
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1 className={headlineClass}>
          Assign <span className="text-cyan-edge">rooms</span>
        </h1>
        <p className="text-sm text-warm-gray">Only fully paid people, in rooms of their gender and room type.</p>
      </header>

      {pools.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white p-4 text-sm text-warm-gray">
          Nobody is fully paid yet, and there are no rooms.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {pools.map((p) => (
            <Link
              key={poolKey(p)}
              href={`?pool=${poolKey(p)}`}
              className={cn(
                "cm-press flex h-10 items-center gap-1 rounded-full border px-4 text-sm",
                p === pool ? "border-soot bg-soot text-white" : "border-stone-border bg-white hover:bg-stone-canvas",
              )}
            >
              <span className="font-medium">{poolName(p)}</span>
              <span className={p === pool ? "text-ash-gray" : "text-warm-gray"}>
                {" "}
                · {p.assigned} of {p.fully_paid} placed · {p.beds} beds
              </span>
            </Link>
          ))}
        </div>
      )}

      {pools.length > 0 && <SendRoomSms campId={camp.id} pending={smsPending.length} />}

      {pool && board && (
        // Keyed by pool, so a warning from one pool isn't left showing on another.
        <Notices key={poolKey(pool)}>
          {(waiting > freeBeds || tooBig.length > 0) && (
            <div className="mb-4 space-y-1 rounded-[10px] border border-stone-border bg-white p-3 text-sm text-ink-black">
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
                  <p className="text-sm text-warm-gray">No groups waiting.</p>
                ) : (
                  <ul className="divide-y divide-stone-border">
                    {board.groups.map((g) => {
                      const unplaced = g.members.filter((m) => !m.room_label).length;
                      return (
                        <li key={g.id} className="space-y-2 py-3">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-mono">{formatGroupCode(g.code)}</span>
                            <span className="inline-flex items-center gap-1 text-[13px]">
                              {g.state === "open" ? (
                                <LockOpen className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                              ) : (
                                <Lock className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                              )}
                              {GROUP_STATE_LABELS[g.state]}
                            </span>
                            <span className="text-warm-gray">
                              {g.members.length} of {g.capacity}
                            </span>
                          </div>
                          <p className="text-sm text-warm-gray">
                            {g.members.map((m, i) => (
                              <span key={m.registration_id}>
                                {i > 0 && ", "}
                                {m.full_name}
                                {m.room_label && <span className="text-ash-gray"> ({m.room_label})</span>}
                              </span>
                            ))}
                          </p>
                          {g.state === "open" && (
                            <p className="text-xs text-ink-black">Still open: its members may change.</p>
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
                  <p className="text-sm text-warm-gray">Nobody unmatched.</p>
                ) : (
                  <ul className="divide-y divide-stone-border">
                    {board.people.map((p) => (
                      <li key={p.id} className="space-y-2 py-3">
                        <p className="text-sm">
                          <span className="font-medium">{p.full_name}</span>
                          <span className="text-warm-gray"> · {p.fellowship}</span>
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
                <p className="text-sm text-warm-gray">
                  No {poolName(pool).toLowerCase()} rooms yet.{" "}
                  <Link href={`/admin/camp/${camp.id}/rooms`} className="underline">
                    Add rooms
                  </Link>
                </p>
              ) : (
                <ul className="divide-y divide-stone-border">
                  {board.rooms.map((r) => (
                    <li key={r.id} className="py-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-3">
                          <span className="font-medium">{r.label}</span>
                          <span className="flex gap-1" aria-hidden="true">
                            {Array.from({ length: Math.min(r.capacity, 12) }, (_, i) => (
                              <span
                                key={i}
                                className={cn("h-3 w-3 rounded-full", i < r.occupied ? "bg-soot" : "border-[1.5px] border-stone-muted")}
                              />
                            ))}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "tabular-nums",
                            r.occupied === r.capacity ? "text-ink-black" : r.occupied ? "text-ink-black" : "text-warm-gray",
                          )}
                        >
                          {r.occupied} of {r.capacity}
                        </span>
                      </div>
                      {r.occupants.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {r.occupants.map((o) => (
                            <li key={o.registration_id} className="flex items-center justify-between gap-2 text-sm text-warm-gray">
                              <span>
                                {o.full_name}
                                {o.group_code && (
                                  <span className="ml-2 font-mono text-xs text-ash-gray">{formatGroupCode(o.group_code)}</span>
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
