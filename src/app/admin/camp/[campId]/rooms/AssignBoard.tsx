"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, GripVertical, Lock, MessageSquare, Plus, Shuffle, X } from "lucide-react";
import type { getPoolBoard } from "@/lib/camp/assignments";
import { Sheet } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { cn } from "@/lib/utils";
import { assignGroupAction, assignPersonAction, sendRoomSmsAction, unassignAction, unassignManyAction } from "../../actions";

type Board = Awaited<ReturnType<typeof getPoolBoard>>;
type Card = { kind: "group" | "person"; id: string; title: string; sub: string; names: string; need: number; anyRoom?: boolean; open?: boolean };

const first = (name: string) => name.split(" ")[0];

/**
 * Assign rooms: drag a group or person onto a room (mouse), pick from
 * "Move to" (keyboard), or tap a card then a room (phones). Every placement
 * ends in a toast with Undo instead of an "are you sure?".
 */
export function AssignBoard({
  campId,
  pools,
  current,
  board,
  smsPending,
}: {
  campId: string;
  pools: { key: string; name: string; waiting: number }[];
  current: string | null;
  board: Board | null;
  smsPending: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dragging, setDragging] = useState<Card | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [tapped, setTapped] = useState<Card | null>(null);
  const [pending, start] = useTransition();
  const [confirmSms, setConfirmSms] = useState(false);

  if (!pools.length || !board) {
    return <p className="rounded-[10px] border border-stone-border bg-white p-5 text-[15px] text-warm-gray">Nobody is fully paid yet, and there are no rooms.</p>;
  }

  const cards: Card[] = [
    ...board.groups.map((g) => {
      const unplaced = g.members.filter((m) => !m.room_label);
      return {
        kind: "group" as const,
        id: g.id,
        title: `${first(g.members[0]?.full_name ?? "A")}'s group`,
        sub: `${unplaced.length} to place${g.state === "open" ? " · still open" : ""}`,
        names: unplaced.map((m) => first(m.full_name)).join(", "),
        need: unplaced.length,
        open: g.state === "open",
      };
    }),
    ...board.people.map((p) => ({ kind: "person" as const, id: p.id, title: p.full_name, sub: p.fellowship, names: "", need: 1, anyRoom: !!p.any_room })),
  ];
  const free = (r: Board["rooms"][number]) => r.capacity - r.occupied;
  const fits = (card: Card | null) => board.rooms.filter((r) => card && free(r) >= card.need);
  const freeBeds = board.rooms.reduce((n, r) => n + free(r), 0);
  const needed = cards.reduce((n, c) => n + c.need, 0);

  const place = (card: Card, roomId: string) =>
    start(async () => {
      const r = card.kind === "group" ? await assignGroupAction(roomId, card.id) : await assignPersonAction(roomId, card.id);
      setTapped(null);
      if (!r.ok) return toast(r.error, { tone: "error" });
      const placed = r.data.placed;
      toast(`${card.kind === "group" ? card.title : first(card.title)} in ${r.data.room}${r.data.warning ? `. ${r.data.warning}` : ""}`, {
        action: {
          label: "Undo",
          run: () =>
            start(async () => {
              const u = await unassignManyAction(placed);
              toast(u.ok ? "Undone" : u.error, { tone: u.ok ? "ok" : "error" });
              router.refresh();
            }),
        },
      });
      router.refresh();
    });

  const takeOut = (registrationId: string, name: string, roomId: string, label: string) =>
    start(async () => {
      const r = await unassignAction(registrationId);
      if (!r.ok) return toast(r.error, { tone: "error" });
      toast(`${first(name)} taken out of ${label}`, {
        action: {
          label: "Undo",
          run: () =>
            start(async () => {
              const u = await assignPersonAction(roomId, registrationId);
              toast(u.ok ? `${first(name)} back in ${label}` : u.error, { tone: u.ok ? "ok" : "error" });
              router.refresh();
            }),
        },
      });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Room types" className="flex flex-1 gap-2 overflow-x-auto pb-1">
          {pools.map((p) => (
            <Link
              key={p.key}
              href={`?tab=assign&pool=${p.key}`}
              aria-current={p.key === current ? "true" : undefined}
              className={cn(
                "cm-press flex h-9 flex-none items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium",
                p.key === current ? "border-soot bg-soot text-white" : "border-stone-border bg-white",
              )}
            >
              {p.name}
              <span className={p.key === current ? "text-stone-muted" : "text-warm-gray"}>{p.waiting}</span>
            </Link>
          ))}
        </nav>
        {smsPending > 0 &&
          (confirmSms ? (
            <span className="cm-pop flex items-center gap-2 rounded-full border-2 border-soot bg-white py-1 pl-4 pr-1 text-[13px]">
              Send {Math.min(smsPending, 250)} texts?
              <button type="button" onClick={() => setConfirmSms(false)} className="h-8 rounded-full px-3 font-medium">
                No
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setConfirmSms(false);
                    const r = await sendRoomSmsAction(campId);
                    if (!r.ok) return toast(r.error, { tone: "error" });
                    toast(`Texted ${r.data.sent} ${r.data.sent === 1 ? "person" : "people"} their room${r.data.remaining ? `. ${r.data.remaining} still to text.` : ""}`);
                    router.refresh();
                  })
                }
                className="h-8 rounded-full bg-soot px-3 font-medium text-white"
              >
                Send
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmSms(true)} className="cm-press inline-flex h-9 items-center gap-2 rounded-full border border-stone-border bg-white px-3.5 text-[13px] font-medium">
              <MessageSquare className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Text {smsPending} their room
            </button>
          ))}
      </div>

      {needed > freeBeds && (
        <p className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> {needed - freeBeds} short of beds in this room type.{" "}
          <Link href="?tab=all" className="underline underline-offset-[3px]">
            Add rooms
          </Link>
        </p>
      )}

      <div className="grid items-start gap-5 md:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-semibold">Waiting · {needed}</h2>
          {cards.length === 0 && <p className="rounded-[10px] border border-stone-border bg-white p-4 text-sm text-warm-gray">Everyone here has a room.</p>}
          <ul className="flex flex-col gap-2">
            {cards.map((c) => {
              const options = fits(c);
              return (
                <li
                  key={c.id}
                  draggable={!pending}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", c.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragging(c);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-[10px] border border-stone-border bg-white py-2.5 pl-1.5 pr-2.5 shadow-seline-card md:cursor-grab",
                    dragging?.id === c.id && "cm-dragging",
                  )}
                >
                  <GripVertical className="h-[18px] w-[18px] flex-none text-ash-gray max-md:hidden" strokeWidth={1.6} aria-hidden="true" />
                  <button type="button" onClick={() => setTapped(c)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left md:pointer-events-none">
                    <span className="text-sm font-medium">
                      {c.title} <span className="font-normal text-warm-gray">· {c.sub}</span>
                    </span>
                    {c.names && <span className="truncate text-[13px] text-[#57534e]">{c.names}</span>}
                    {c.anyRoom && (
                      <span className="flex items-center gap-1 text-xs text-warm-gray">
                        <Shuffle className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" /> Any room
                      </span>
                    )}
                  </button>
                  <ChevronRight className="h-4 w-4 flex-none text-ash-gray md:hidden" strokeWidth={1.8} aria-hidden="true" />
                  <select
                    aria-label={`Move ${c.title} to a room`}
                    value=""
                    disabled={pending || !options.length}
                    onChange={(e) => e.target.value && place(c, e.target.value)}
                    className="h-9 flex-none rounded-full border border-stone-muted bg-white px-2.5 text-[13px] max-md:hidden"
                  >
                    <option value="">{options.length ? "Move to" : "No room fits"}</option>
                    {options.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} · {free(r)} free
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-semibold">Rooms · {freeBeds} free beds</h2>
          {board.rooms.length === 0 ? (
            <p className="rounded-[10px] border border-stone-border bg-white p-4 text-sm text-warm-gray">
              No rooms of this type yet.{" "}
              <Link href="?tab=all" className="underline underline-offset-[3px]">
                Add rooms
              </Link>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {board.rooms.map((r) => {
                const canDrop = !!dragging && free(r) >= dragging.need;
                return (
                  <article
                    key={r.id}
                    onDragOver={(e) => {
                      if (!canDrop) return;
                      e.preventDefault();
                      setOver(r.id);
                    }}
                    onDragLeave={() => setOver((o) => (o === r.id ? null : o))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setOver(null);
                      if (dragging && canDrop) place(dragging, r.id);
                    }}
                    className={cn(
                      "flex min-h-[140px] flex-col gap-2 rounded-[12px] border border-stone-border bg-white p-3.5 transition-colors",
                      over === r.id && "cm-drop-target",
                      dragging && !canDrop && "opacity-50",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-display text-xl">{r.label}</span>
                      <Beds capacity={r.capacity} taken={r.occupied} />
                    </span>
                    <ul className="flex flex-col text-[13px]">
                      {r.occupants.length === 0 && <li className="text-warm-gray">Empty</li>}
                      {r.occupants.map((o) => (
                        <li key={o.registration_id} className="group flex min-h-7 items-center justify-between gap-1">
                          <span className="truncate">{o.full_name}</span>
                          <button
                            type="button"
                            onClick={() => takeOut(o.registration_id, o.full_name, r.id, r.label)}
                            aria-label={`Take ${o.full_name} out of ${r.label}`}
                            className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-ash-gray hover:bg-stone-canvas hover:text-ink-black"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {over === r.id && <span className="text-[13px] font-semibold text-cyan-deep">Drop here</span>}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Sheet open={!!tapped} onClose={() => setTapped(null)} title={tapped ? `Place ${tapped.kind === "group" ? `${tapped.title} (${tapped.need})` : first(tapped.title)}` : ""} subtitle={tapped?.open ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" aria-hidden="true" />Still open: members may change</span> : undefined}>
        {tapped && fits(tapped).length === 0 && <p className="text-sm text-warm-gray">No room has {tapped.need} free beds.</p>}
        <div className="flex flex-col gap-2">
          {tapped &&
            fits(tapped).map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={pending}
                onClick={() => place(tapped, r.id)}
                className="cm-press flex min-h-14 items-center gap-3 rounded-[12px] border border-stone-border bg-white px-4 text-left"
              >
                <span className="font-display text-xl">{r.label}</span>
                <span className="flex-1 text-[13px] text-warm-gray">{free(r)} free</span>
                <Plus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              </button>
            ))}
        </div>
      </Sheet>
    </div>
  );
}

export function Beds({ capacity, taken }: { capacity: number; taken: number }) {
  return (
    <span className="flex gap-1" role="img" aria-label={`${taken} of ${capacity} beds taken`}>
      {Array.from({ length: Math.min(capacity, 10) }, (_, i) => (
        <span key={i} className={cn("h-[11px] w-[11px] rounded-full", i < taken ? "bg-cyan-edge" : "border-[1.5px] border-stone-muted")} />
      ))}
    </span>
  );
}
