"use client";
import { Busy } from "@/components/camp/brand";

import { useEffect, useMemo, useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import Link from "next/link";
import { AlertTriangle, ChevronDown, CircleCheck, GripVertical, Lock, MessageSquare, Pencil, Plus, Search, Shuffle, Upload, Wand2, X } from "lucide-react";
import type { RoomLane } from "@/lib/camp/assignments";
import type { Gender, RoomType, RoomWithOccupants } from "@/lib/camp/types";
import { Sheet } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { Field, Legend, StackedBar, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { planFill } from "@/lib/camp/fill";
import {
  assignGroupAction,
  assignPersonAction,
  fillAllRoomsAction,
  fillRoomsAction,
  saveRoomAction,
  sendRoomSmsAction,
  unassignAction,
  unassignManyAction,
} from "../../actions";
import { ImportRooms } from "./AllRooms";
import { Arrived, BedBar } from "./Beds";

type Board = RoomLane["board"];
type Card = {
  kind: "group" | "person";
  id: string;
  lane: string;
  laneName: string;
  title: string;
  /** Who's in it (groups) or their fellowship (people). */
  detail: string;
  need: number;
  anyRoom?: boolean;
  open?: boolean;
};
type Placed = RoomWithOccupants & { lane: string };

const first = (name: string) => name.split(" ")[0];
const who = (g: Gender) => (g === "male" ? "Men" : "Women");
const laneName = (l: Pick<RoomLane, "gender" | "room_type_name">) => `${who(l.gender)} · ${l.room_type_name}`;
const beds = (n: number) => `${n} ${n === 1 ? "bed" : "beds"}`;
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

const ghost =
  "cm-press inline-flex h-10 items-center gap-2 rounded-full border border-stone-border bg-white px-4 text-[13px] font-medium text-ink-black transition-colors hover:border-stone-muted disabled:opacity-60";
const segment = (on: boolean) =>
  cn(
    "cm-press flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
    on ? "bg-soot text-white" : "text-ink-black hover:bg-stone-rail",
  );

/**
 * One workspace. The top says how far along rooms are and holds the two big
 * actions. Below, people waiting sit on the left; pick one and the rooms they
 * fit light up on the right. Tap or drop to place; every placement has Undo.
 */
export function AssignBoard({
  campId,
  lanes,
  roomTypes,
  smsPending,
  startPool,
  startWho,
  startType,
}: {
  campId: string;
  lanes: RoomLane[];
  roomTypes: RoomType[];
  smsPending: number;
  startPool: string | null;
  startWho: "" | Gender;
  startType: string;
}) {
  const toast = useToast();
  const startLane = lanes.find((l) => l.key === startPool);
  const [whoFilter, setWhoFilter] = useState<"" | Gender>(startLane?.gender ?? startWho);
  const [typeFilter, setTypeFilter] = useState(startLane?.room_type_id ?? startType);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Card | null>(null);
  const [dragging, setDragging] = useState<Card | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, start] = useOneAtATime();
  const [confirm, setConfirm] = useState<null | "random" | "sms">(null);
  const [filling, setFilling] = useState<RoomLane | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [renaming, setRenaming] = useState<RoomWithOccupants | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPicked(null);
        setDragging(null);
        setConfirm(null);
      }
    };
    const m = window.matchMedia("(max-width: 767px)");
    const sync = () => setPhone(m.matches);
    sync();
    m.addEventListener("change", sync);
    window.addEventListener("keydown", onKey);
    return () => {
      m.removeEventListener("change", sync);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const shownLanes = useMemo(
    () => lanes.filter((l) => (!whoFilter || l.gender === whoFilter) && (!typeFilter || l.room_type_id === typeFilter)),
    [lanes, whoFilter, typeFilter],
  );
  const many = shownLanes.length > 1;

  const cards: Card[] = shownLanes.flatMap((l) => [
    ...l.board.groups.map((g) => {
      const unplaced = g.members.filter((m) => !m.room_label);
      return {
        kind: "group" as const,
        id: g.id,
        lane: l.key,
        laneName: laneName(l),
        title: `${first(g.members[0]?.full_name ?? "A")}'s group`,
        detail: unplaced.map((m) => first(m.full_name)).join(", "),
        need: unplaced.length,
        open: g.state === "open",
      };
    }),
    ...l.board.people.map((p) => ({
      kind: "person" as const,
      id: p.id,
      lane: l.key,
      laneName: laneName(l),
      title: p.full_name,
      detail: p.fellowship,
      need: 1,
      anyRoom: !!p.any_room,
    })),
  ]);

  const query = q.trim().toLowerCase();
  const visible = query ? cards.filter((c) => `${c.title} ${c.detail}`.toLowerCase().includes(query)) : cards;

  const rooms: Placed[] = shownLanes.flatMap((l) => l.board.rooms.map((r) => ({ ...r, lane: l.key })));
  const freeOf = (r: RoomWithOccupants) => Math.max(0, r.capacity - r.occupied);
  const fits = (card: Card | null, r: Placed) => !!card && r.lane === card.lane && freeOf(r) >= card.need;
  const freeBeds = rooms.reduce((n, r) => n + freeOf(r), 0);
  const placedCount = rooms.reduce((n, r) => n + r.occupied, 0);
  const needed = cards.reduce((n, c) => n + c.need, 0);
  const waitingAll = lanes.reduce((n, l) => n + l.waiting, 0);
  const waitingFor = (g: "" | Gender, t = "") =>
    lanes.filter((l) => (!g || l.gender === g) && (!t || l.room_type_id === t)).reduce((n, l) => n + l.waiting, 0);
  const types = [...new Map(lanes.map((l) => [l.room_type_id, l.room_type_name])).entries()];
  const laneNeed = (l: RoomLane) => l.board.groups.reduce((n, g) => n + g.members.filter((m) => !m.room_label).length, 0) + l.board.people.length;
  const laneFree = (l: RoomLane) => l.board.rooms.reduce((n, r) => n + freeOf(r), 0);
  const short = shownLanes.filter((l) => laneNeed(l) > laneFree(l));
  const active = dragging ?? picked;
  const fitting = active ? rooms.filter((r) => fits(active, r)).length : 0;

  const pick = (c: Card | null) => {
    setPicked(c);
    setConfirm(null);
  };

  const place = (card: Card, roomId: string) =>
    start(async () => {
      const r = card.kind === "group" ? await assignGroupAction(roomId, card.id) : await assignPersonAction(roomId, card.id);
      setPicked(null);
      if (!r.ok) return toast(r.error, { tone: "error" });
      const placed = r.data.placed;
      toast(`${card.kind === "group" ? card.title : first(card.title)} in ${r.data.room}${r.data.warning ? `. ${r.data.warning}` : ""}`, {
        action: {
          label: "Undo",
          run: () =>
            start(async () => {
              const u = await unassignManyAction(placed);
              toast(u.ok ? "Undone" : u.error, { tone: u.ok ? "ok" : "error" });
            }),
        },
      });
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
            }),
        },
      });
    });

  const saveName = (room: RoomWithOccupants, label: string) =>
    start(async () => {
      const next = label.trim();
      setRenaming(null);
      if (!next || next === room.label) return;
      const r = await saveRoomAction(campId, room.id, {
        label: next,
        room_type_id: room.room_type_id,
        gender: room.gender,
        capacity: room.capacity,
      });
      toast(r.ok ? `${next} saved` : r.error, { tone: r.ok ? "ok" : "error" });
    });

  const placeEveryone = () =>
    start(async () => {
      setConfirm(null);
      const r = await fillAllRoomsAction(campId);
      if (!r.ok) return toast(r.error, { tone: "error" });
      toast(
        r.data.placed
          ? `Placed ${people(r.data.placed)}${r.data.problems.length ? `. ${r.data.problems.length} couldn't go where planned; they're still waiting.` : ""}`
          : "No one could be placed. Add rooms, or take people out of full ones.",
        !r.data.placed || r.data.problems.length ? { tone: "error" } : undefined,
      );
    });

  const textRooms = () =>
    start(async () => {
      setConfirm(null);
      const r = await sendRoomSmsAction(campId);
      if (!r.ok) return toast(r.error, { tone: "error" });
      toast(
        `Texted ${people(r.data.sent)} their room${r.data.failed ? `. ${r.data.failed} didn't go; press again to retry.` : r.data.remaining ? `. ${r.data.remaining} still to text.` : ""}`,
      );
    });

  if (!lanes.length) {
    return (
      <p className="rounded-[10px] border border-stone-border bg-white p-5 text-[15px] text-warm-gray">
        Nobody is fully paid yet, and there are no rooms.{" "}
        <Link href="?tab=types" className="underline underline-offset-[3px]">
          Add a room type
        </Link>
        .
      </p>
    );
  }

  const progress = [
    { key: "placed", value: placedCount, color: "bg-[#3398e1]", label: "In a room" },
    { key: "waiting", value: needed, color: "bg-sky-wash", label: "Waiting" },
    { key: "free", value: freeBeds, color: "bg-stone-border", label: "Free beds" },
  ];

  return (
    <div className="flex flex-col gap-5" aria-busy={pending}>
      {/* Where things stand, and the two jobs that act on everyone at once. */}
      <section aria-label="Progress" className="flex flex-col gap-4 rounded-[12px] border border-stone-border bg-white p-5 shadow-seline-card md:flex-row md:items-center md:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <StackedBar parts={progress} className="h-2" />
          <Legend parts={progress} />
        </div>
        <div className="flex flex-wrap items-center gap-2 max-md:[&>button]:w-full max-md:[&>button]:justify-center md:justify-end" aria-live="polite">
          {confirm ? (
            <span className="cm-pop flex flex-wrap items-center gap-2 text-[14px]">
              <span className="pr-1">
                {confirm === "random" ? (
                  <>
                    Put <strong className="font-semibold">{people(waitingAll)}</strong> in rooms? Groups stay together.
                  </>
                ) : (
                  <>
                    Text <strong className="font-semibold">{people(Math.min(smsPending, 250))}</strong> their room?
                  </>
                )}
              </span>
              <button type="button" onClick={() => setConfirm(null)} className={ghost}>
                Not now
              </button>
              <button
                type="button"
                disabled={pending}
                aria-busy={pending}
                onClick={confirm === "random" ? placeEveryone : textRooms}
                className={`${primaryButtonClass} h-10 px-5 text-[13px]`}
              >
                <Busy pending={pending} text={confirm === "random" ? "Placing…" : "Sending…"}>
                  {confirm === "random" ? "Yes, place them" : "Yes, send"}
                </Busy>
              </button>
            </span>
          ) : (
            <>
              {smsPending > 0 && (
                <button type="button" onClick={() => setConfirm("sms")} className={ghost}>
                  <MessageSquare className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Text {people(smsPending)} their room
                </button>
              )}
              {waitingAll > 0 && (
                <button type="button" onClick={() => setConfirm("random")} className={`${primaryButtonClass} h-10 px-5 text-[13px]`}>
                  <Shuffle className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Place everyone
                </button>
              )}
              {waitingAll === 0 && smsPending === 0 && (
                <span className="flex items-center gap-2 text-[14px]">
                  <CircleCheck className="h-[18px] w-[18px] text-st-paid" strokeWidth={1.7} aria-hidden="true" /> Everyone has a room and knows it.
                </span>
              )}
            </>
          )}
        </div>
      </section>

      {/* What you're looking at: one switch, one menu, one search box. */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Women or men" className="flex flex-none gap-1 rounded-full border border-stone-border bg-white p-[3px]">
          {(
            [
              ["", "Everyone"],
              ["female", "Women"],
              ["male", "Men"],
            ] as const
          ).map(([id, label]) => {
            const n = waitingFor(id, typeFilter);
            return (
              <button
                key={id || "all"}
                type="button"
                aria-pressed={whoFilter === id}
                onClick={() => {
                  setWhoFilter(id);
                  pick(null);
                }}
                className={segment(whoFilter === id)}
              >
                {label}
                {n > 0 && <span className={cn("tabular-nums", whoFilter === id ? "text-stone-muted" : "text-warm-gray")}>{n}</span>}
              </button>
            );
          })}
        </div>
        {types.length > 1 && (
          <label className="relative flex-none">
            <span className="sr-only">Room type</span>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                pick(null);
              }}
              className={cn(
                "h-[42px] max-w-[min(100%,320px)] cursor-pointer appearance-none truncate rounded-full border bg-white pr-10 pl-4 text-[13px] font-medium text-ink-black transition-colors hover:border-stone-muted",
                typeFilter ? "border-soot" : "border-stone-border",
              )}
            >
              <option value="">All room types</option>
              {types.map(([id, name]) => {
                const n = waitingFor(whoFilter, id);
                return (
                  <option key={id} value={id}>
                    {name}
                    {n ? ` · ${n} waiting` : ""}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-warm-gray" strokeWidth={1.7} aria-hidden="true" />
          </label>
        )}
        <label className="relative min-w-[200px] flex-1 md:max-w-[320px]">
          <span className="sr-only">Find a name</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ash-gray" strokeWidth={1.7} aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a name"
            className="h-[42px] w-full rounded-full border border-stone-border bg-white pr-4 pl-10 text-[13px] placeholder:text-ash-gray focus-visible:border-cyan-edge"
          />
        </label>
      </div>

      {short.length > 0 && (
        <p className="flex items-start gap-2 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.7} aria-hidden="true" />
          <span>
            {short.map(laneName).join(", ")} {short.length === 1 ? "has" : "have"} more people than free beds. Place everyone opens new rooms, or{" "}
            <button type="button" onClick={() => setAdding(true)} className="underline underline-offset-[3px]">
              add one yourself
            </button>
            .
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        {/* Waiting */}
        <section aria-labelledby="waiting-h" className="flex flex-col gap-3 lg:sticky lg:top-20">
          <div className="flex min-h-10 items-baseline justify-between gap-3">
            <h2 id="waiting-h" className="font-display text-xl">
              Waiting <span className="text-warm-gray tabular-nums">{needed}</span>
            </h2>
            {needed > 0 && <span className="text-[13px] text-warm-gray max-md:hidden">Pick one, then a room</span>}
          </div>
          {visible.length === 0 ? (
            <p className="flex items-center gap-2 rounded-[12px] border border-dashed border-stone-muted px-4 py-5 text-sm text-warm-gray">
              {needed === 0 ? (
                <>
                  <CircleCheck className="h-[18px] w-[18px] flex-none text-st-paid" strokeWidth={1.7} aria-hidden="true" /> Everyone here has a room.
                </>
              ) : (
                <>No names match &ldquo;{q}&rdquo;.</>
              )}
            </p>
          ) : (
            <ul className="flex flex-col gap-2 lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto lg:p-0.5">
              {visible.map((c) => {
                const on = picked?.id === c.id && picked.kind === c.kind;
                return (
                  <li
                    key={`${c.kind}-${c.id}`}
                    draggable={!pending}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(c);
                      setPicked(c);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    className={cn(
                      "group/card relative flex items-stretch rounded-[12px] border bg-white transition-[border-color,background-color,box-shadow] duration-150 ease-out md:cursor-grab",
                      on ? "border-cyan-edge bg-cyan-tint shadow-[0_0_0_1px_#2f90da]" : "border-stone-border hover:border-stone-muted",
                      dragging?.id === c.id && "cm-dragging",
                    )}
                  >
                    <GripVertical
                      className={cn("my-auto ml-2 h-4 w-4 flex-none max-md:hidden", on ? "text-cyan-edge" : "text-stone-muted group-hover/card:text-ash-gray")}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      onClick={() => pick(on ? null : c)}
                      aria-pressed={on}
                      aria-label={`${c.title}, ${beds(c.need)}${on ? ", picked" : ""}`}
                      className="flex min-w-0 flex-1 items-start gap-3 py-3 pr-4 pl-3 text-left md:pl-2"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[14px] font-medium">{c.title}</span>
                        {c.detail && <span className="truncate text-[13px] text-warm-gray">{c.detail}</span>}
                        {(c.open || c.anyRoom || many) && (
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-warm-gray">
                            {many && <span>{c.laneName}</span>}
                            {c.open && (
                              <span className="inline-flex items-center gap-1">
                                <Lock className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" /> Still open
                              </span>
                            )}
                            {c.anyRoom && (
                              <span className="inline-flex items-center gap-1">
                                <Shuffle className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" /> Any room
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-none flex-col items-end leading-none" aria-hidden="true">
                        <span className="font-display text-[22px] tabular-nums">{c.need}</span>
                        <span className="mt-1 text-[11px] text-warm-gray">{c.need === 1 ? "bed" : "beds"}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Rooms */}
        <section aria-labelledby="rooms-h" className="flex flex-col gap-4">
          <div className="flex min-h-10 flex-wrap items-baseline justify-between gap-3">
            <h2 id="rooms-h" className="font-display text-xl">
              Rooms <span className="text-warm-gray tabular-nums">{rooms.length}</span>
            </h2>
            {rooms.some((r) => r.occupants.some((o) => o.checked_in)) && (
              <span className="flex items-center gap-1.5 text-[13px] text-warm-gray max-sm:order-last max-sm:w-full">
                <span className="h-2 w-2 rounded-full bg-st-paid" aria-hidden="true" /> Arrived at camp
              </span>
            )}
            <span className="flex gap-2 self-center">
              <button type="button" onClick={() => setImporting(true)} className={cn(ghost, "h-9 px-3.5")}>
                <Upload className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Import
              </button>
              <button type="button" onClick={() => setAdding(true)} className={cn(ghost, "h-9 px-3.5")}>
                <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Add a room
              </button>
            </span>
          </div>
          {rooms.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-stone-muted px-4 py-5 text-sm leading-relaxed text-warm-gray">
              No rooms here yet. A group gets a room as soon as someone sends its join link. Place everyone makes the rest, or add one yourself.
            </p>
          ) : (
            shownLanes.map((l) => {
              if (!l.board.rooms.length) return null;
              const need = laneNeed(l);
              const free = laneFree(l);
              return (
                <div key={l.key} className="flex flex-col gap-3">
                  {(many || (need > 0 && free > 0)) && (
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-stone-border pb-2">
                      <h3 className="text-[14px] font-medium">
                        {laneName(l)}
                        <span className="font-normal text-warm-gray">
                          {" "}
                          · {beds(free)} free{need ? ` · ${need} waiting` : ""}
                        </span>
                      </h3>
                      {need > 0 && free > 0 && (
                        <button
                          type="button"
                          onClick={() => setFilling(l)}
                          className="cm-press -mr-2 inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-cyan-deep hover:bg-cyan-tint"
                        >
                          <Wand2 className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Fill these rooms
                        </button>
                      )}
                    </div>
                  )}
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,208px),1fr))] gap-3">
                    {l.board.rooms.map((raw) => {
                      const r: Placed = { ...raw, lane: l.key };
                      const hot = !!active && fits(active, r);
                      const cold = !!active && !hot;
                      const left = freeOf(r);
                      const arrived = r.occupants.filter((o) => o.checked_in).length;
                      return (
                        <li
                          key={r.id}
                          onDragOver={(e) => {
                            if (!hot) return;
                            e.preventDefault();
                            setOver(r.id);
                          }}
                          onDragLeave={() => setOver((o) => (o === r.id ? null : o))}
                          onDrop={(e) => {
                            e.preventDefault();
                            setOver(null);
                            if (dragging && hot) place(dragging, r.id);
                          }}
                          className={cn(
                            "group/room flex md:min-h-[156px] flex-col rounded-[12px] border bg-white p-4 transition-[outline-color,background-color,opacity] duration-150 ease-out",
                            hot ? "cm-room-hot" : "border-stone-border",
                            over === r.id && "cm-drop-target",
                            cold && "cm-room-cold",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            {renaming?.id === r.id ? (
                              <input
                                autoFocus
                                value={nameDraft}
                                onChange={(e) => setNameDraft(e.target.value)}
                                onBlur={() => saveName(r, nameDraft)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                  if (e.key === "Escape") setRenaming(null);
                                }}
                                className="font-display h-8 min-w-0 flex-1 rounded-[6px] border border-cyan-edge bg-white px-2 text-lg"
                                aria-label={`Name for ${r.label}`}
                              />
                            ) : (
                              <span className="flex min-w-0 items-center gap-0.5">
                                <span className="font-display truncate text-lg whitespace-nowrap" title={r.label}>
                                  {r.label}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Rename ${r.label}`}
                                  onClick={() => {
                                    setRenaming(r);
                                    setNameDraft(r.label);
                                  }}
                                  className="cm-press flex h-7 w-7 flex-none items-center justify-center rounded-full text-ash-gray hover:bg-stone-rail hover:text-ink-black focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/room:opacity-100"
                                >
                                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                                </button>
                              </span>
                            )}
                            <span className="flex-none text-[13px] tabular-nums">
                              <span className="font-medium">{r.occupied}</span>
                              <span className="text-warm-gray"> / {r.capacity}</span>
                            </span>
                          </div>
                          <BedBar capacity={r.capacity} taken={r.occupied} arrived={arrived} className="mt-2.5 mb-3" />
                          <ul className="flex flex-col text-[13px]">
                            {r.occupants.map((o) => (
                              <li key={o.registration_id} className="group/name -mx-1.5 flex min-h-7 items-center justify-between gap-1 rounded-[6px] px-1.5 hover:bg-stone-rail">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <Arrived on={!!o.checked_in} />
                                  <span className="truncate">{o.full_name}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => takeOut(o.registration_id, o.full_name, r.id, r.label)}
                                  aria-label={`Take ${o.full_name} out of ${r.label}`}
                                  className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-ash-gray hover:text-ink-black focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/name:opacity-100"
                                >
                                  <X className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                                </button>
                              </li>
                            ))}
                          </ul>
                          {left > 0 &&
                            (hot && active ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => place(active, r.id)}
                                className="cm-press mt-auto flex h-10 items-center justify-center gap-1.5 rounded-[8px] bg-cyan-signal text-[13px] font-medium text-ink-black"
                              >
                                <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Place here
                              </button>
                            ) : (
                              <span className="mt-auto flex h-10 items-center justify-center rounded-[8px] border border-dashed border-stone-muted text-[13px] text-warm-gray">
                                {beds(left)} free
                              </span>
                            ))}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      </div>

      {/* While someone is picked on a laptop: who, how many beds, and the way out. */}
      {picked && !phone && (
        <div
          role="status"
          className="cm-pop fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-full bg-soot py-2 pr-2 pl-5 text-[14px] text-white shadow-seline-hero"
        >
          <span>
            <span className="font-medium">{picked.kind === "group" ? picked.title : first(picked.title)}</span>
            <span className="text-stone-muted">
              {" "}
              · {beds(picked.need)} ·{" "}
              {fitting ? `${fitting} ${fitting === 1 ? "room fits" : "rooms fit"}` : "no room has space"}
            </span>
          </span>
          <button type="button" onClick={() => setPicked(null)} className="cm-press flex h-9 items-center gap-2 rounded-full bg-white/10 px-3.5 font-medium hover:bg-white/15">
            Cancel <kbd className="font-sans text-[11px] text-stone-muted">Esc</kbd>
          </button>
        </div>
      )}

      <Sheet
        open={phone && !!picked && !dragging}
        onClose={() => setPicked(null)}
        title={picked ? `Place ${picked.kind === "group" ? `${picked.title} (${picked.need})` : first(picked.title)}` : ""}
        subtitle={
          picked?.open ? (
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Still open: members may change
            </span>
          ) : undefined
        }
      >
        {picked && rooms.filter((r) => fits(picked, r)).length === 0 && <p className="text-sm text-warm-gray">No room has {beds(picked.need)} free.</p>}
        <div className="flex flex-col gap-2">
          {picked &&
            rooms
              .filter((r) => fits(picked, r))
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={pending}
                  onClick={() => place(picked, r.id)}
                  className="cm-press flex min-h-16 flex-col justify-center gap-2 rounded-[12px] border border-stone-border bg-white px-4 py-3 text-left"
                >
                  <span className="flex w-full items-center gap-3">
                    <span className="font-display text-lg">{r.label}</span>
                    <span className="flex-1 text-[13px] text-warm-gray">{beds(freeOf(r))} free</span>
                    <Plus className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <BedBar capacity={r.capacity} taken={r.occupied} arrived={r.occupants.filter((o) => o.checked_in).length} />
                </button>
              ))}
        </div>
      </Sheet>
      {filling && <FillSheet open onClose={() => setFilling(null)} campId={campId} board={filling.board} />}
      <AddRoomSheet key={adding ? `${whoFilter}.${typeFilter}` : "shut"} open={adding} onClose={() => setAdding(false)} campId={campId} roomTypes={roomTypes} who={whoFilter} typeId={typeFilter} />
      <ImportRooms open={importing} onClose={() => setImporting(false)} campId={campId} roomTypes={roomTypes} />
    </div>
  );
}

function AddRoomSheet({
  open,
  onClose,
  campId,
  roomTypes,
  who,
  typeId,
}: {
  open: boolean;
  onClose: () => void;
  campId: string;
  roomTypes: RoomType[];
  who: "" | Gender;
  typeId: string;
}) {
  const toast = useToast();
  const [pending, start] = useOneAtATime();
  const fallback = roomTypes[0];
  const [label, setLabel] = useState("");
  const [roomTypeId, setRoomTypeId] = useState(typeId || fallback?.id || "");
  const [gender, setGender] = useState<Gender>(who || "female");
  const [capacity, setCapacity] = useState(roomTypes.find((t) => t.id === (typeId || fallback?.id))?.capacity ?? 4);
  const [error, setError] = useState("");


  if (!fallback) return null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add a room"
      footer={
        <>
          <button type="button" onClick={onClose} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !label.trim()}
            onClick={() =>
              start(async () => {
                setError("");
                const r = await saveRoomAction(campId, null, { label: label.trim(), room_type_id: roomTypeId, gender, capacity });
                if (!r.ok) return setError(r.error);
                toast(`${label.trim()} added`);
                onClose();
              })
            }
            className={`${primaryButtonClass} flex-1`}
          >
            <Busy pending={pending} text="Saving…">
              Add
            </Busy>
          </button>
        </>
      }
    >
      <Field label="Name or number">
        <input autoFocus className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A03" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Room type">
          <select
            className={inputClass}
            value={roomTypeId}
            onChange={(e) => {
              setRoomTypeId(e.target.value);
              setCapacity(roomTypes.find((t) => t.id === e.target.value)?.capacity ?? capacity);
            }}
          >
            {roomTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="For">
          <select className={inputClass} value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            <option value="female">Women</option>
            <option value="male">Men</option>
          </select>
        </Field>
      </div>
      {error && <p className="text-sm">{error}</p>}
    </Sheet>
  );
}

/**
 * The draft from "Fill these", room by room. Nothing is saved until Place.
 */
function FillSheet({ open, onClose, campId, board }: { open: boolean; onClose: () => void; campId: string; board: Board }) {
  const toast = useToast();
  const [pending, start] = useOneAtATime();
  const plan = open ? planFill(board) : null;
  const count = plan ? plan.steps.reduce((n, s) => n + s.names.length, 0) : 0;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Fill these"
      subtitle="Groups together first, then everyone else beside their own fellowship. Check it, then place."
      footer={
        <button
          type="button"
          disabled={pending || !count}
          aria-busy={pending}
          onClick={() =>
            start(async () => {
              const r = await fillRoomsAction(campId, plan!.steps);
              if (!r.ok) return toast(r.error, { tone: "error" });
              onClose();
              toast(
                `Placed ${r.data.placed} ${r.data.placed === 1 ? "person" : "people"}${r.data.problems.length ? `. ${r.data.problems.length} couldn't go where planned; they're still waiting.` : ""}`,
                r.data.problems.length ? { tone: "error" } : undefined,
              );
            })
          }
          className={`${primaryButtonClass} flex-1`}
        >
          <Busy pending={pending} text="Placing…">{`Place ${count} ${count === 1 ? "person" : "people"}`}</Busy>
        </button>
      }
    >
      {plan && (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col">
            {plan.rooms.map((r) => (
              <li key={r.roomId} className="flex gap-3 border-t border-stone-border py-3 first:border-t-0">
                <span className="w-16 flex-none font-display text-lg">{r.label}</span>
                <span className="text-[15px] leading-relaxed">{r.names.join(", ")}</span>
              </li>
            ))}
          </ul>
          {plan.left.length > 0 && (
            <section className="flex flex-col gap-2 rounded-[12px] bg-stone-rail p-4">
              <h3 className="text-sm font-semibold">Still waiting after this</h3>
              {plan.left.map((l, i) => (
                <p key={i} className="text-[13px] leading-relaxed">
                  <span className="font-medium">{l.names.join(", ")}</span>
                  <span className="text-warm-gray"> · {l.reason}</span>
                </p>
              ))}
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}
