"use client";

import Link from "next/link";
import { Busy } from "@/components/camp/brand";
import { useMemo, useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { ChevronDown, ChevronRight, Minus, Plus, Search, Trash2, Upload } from "lucide-react";
import type { CsvError } from "@/lib/camp/csv";
import type { Gender, RoomType, RoomWithOccupants } from "@/lib/camp/types";
import { InlineConfirm, Sheet } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { assignPersonAction, deleteRoomAction, importRoomsAction, saveRoomAction, unassignAction } from "../../actions";
import { Arrived, BedBar } from "./Beds";

type Draft = { id: string | null; label: string; room_type_id: string; gender: Gender; capacity: number };

const who = (g: Gender) => (g === "male" ? "Men" : "Women");
const bedsWord = (n: number) => `${n} ${n === 1 ? "bed" : "beds"}`;
const ghost =
  "cm-press inline-flex h-10 items-center gap-2 rounded-full border border-stone-border bg-white px-4 text-[13px] font-medium text-ink-black transition-colors hover:border-stone-muted";
const segment = (on: boolean) =>
  cn(
    "cm-press flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
    on ? "bg-soot text-white" : "text-ink-black hover:bg-stone-rail",
  );

/**
 * Every room and who's in it, as one list grouped by who and room type, so
 * 100+ rooms stay scannable. Search finds a room or a person. A row opens the
 * room in a side panel to rename, resize, take people out or delete.
 */
export function AllRooms({ campId, rooms, roomTypes }: { campId: string; rooms: RoomWithOccupants[]; roomTypes: RoomType[] }) {
  const toast = useToast();
  const [gender, setGender] = useState<"" | Gender>("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();

  const query = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rooms.filter(
        (r) =>
          (!gender || r.gender === gender) &&
          (!type || r.room_type_id === type) &&
          (!query || r.label.toLowerCase().includes(query) || r.occupants.some((o) => o.full_name.toLowerCase().includes(query))),
      ),
    [rooms, gender, type, query],
  );
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; gender: Gender; typeId: string; name: string; rooms: RoomWithOccupants[] }>();
    for (const r of shown) {
      const key = `${r.gender}.${r.room_type_id}`;
      if (!map.has(key)) map.set(key, { key, gender: r.gender, typeId: r.room_type_id, name: `${who(r.gender)} · ${r.room_type_name}`, rooms: [] });
      map.get(key)!.rooms.push(r);
    }
    return [...map.values()].sort((a, b) => (a.gender === b.gender ? a.name.localeCompare(b.name) : a.gender === "female" ? -1 : 1));
  }, [shown]);
  const editing = draft?.id ? rooms.find((r) => r.id === draft.id) : null;
  const total = shown.reduce((n, r) => n + r.capacity, 0);
  const free = shown.reduce((n, r) => n + Math.max(0, r.capacity - r.occupied), 0);
  const arrived = shown.reduce((n, r) => n + r.occupants.filter((o) => o.checked_in).length, 0);
  const count = (g: "" | Gender) => rooms.filter((r) => (!g || r.gender === g) && (!type || r.room_type_id === type)).length;

  if (!roomTypes.length) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[12px] border border-stone-border bg-white p-6">
        <p className="text-[17px] font-medium">Add a room type first</p>
        <p className="max-w-prose text-[15px] leading-relaxed text-warm-gray">Rooms belong to a type, which sets the price and beds.</p>
        <Link href="?tab=types" className={`${primaryButtonClass} h-11 px-5`}>
          Go to Room types
        </Link>
      </div>
    );
  }

  const newRoom = (g: "" | Gender = gender, t = type) => {
    const typeId = t || roomTypes[0].id;
    setDraft({ id: null, label: "", room_type_id: typeId, gender: g || "female", capacity: roomTypes.find((x) => x.id === typeId)?.capacity ?? 4 });
  };
  const close = () => {
    setDraft(null);
    setConfirmDelete(false);
    setError("");
  };
  const save = () =>
    draft &&
    start(async () => {
      setError("");
      const { id, ...input } = draft;
      const r = await saveRoomAction(campId, id, input);
      if (!r.ok) return setError(r.error);
      toast(id ? `${input.label} saved` : `${input.label} added`);
      close();
    });

  return (
    <div className="flex flex-col gap-5">
      {/* One switch, one menu, one search box; the two ways to add rooms on the right. */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Women or men" className="flex flex-none gap-1 rounded-full border border-stone-border bg-white p-[3px]">
          {(
            [
              ["", "Everyone"],
              ["female", "Women"],
              ["male", "Men"],
            ] as const
          ).map(([id, label]) => (
            <button key={id || "all"} type="button" aria-pressed={gender === id} onClick={() => setGender(id)} className={segment(gender === id)}>
              {label}
              <span className={cn("tabular-nums", gender === id ? "text-stone-muted" : "text-warm-gray")}>{count(id)}</span>
            </button>
          ))}
        </div>
        {roomTypes.length > 1 && (
          <label className="relative flex-none">
            <span className="sr-only">Room type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={cn(
                "h-[42px] max-w-[min(100%,300px)] cursor-pointer appearance-none truncate rounded-full border bg-white pr-10 pl-4 text-[13px] font-medium transition-colors hover:border-stone-muted",
                type ? "border-soot" : "border-stone-border",
              )}
            >
              <option value="">All room types</option>
              {roomTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-warm-gray" strokeWidth={1.7} aria-hidden="true" />
          </label>
        )}
        <label className="relative min-w-[200px] flex-1 md:max-w-[300px]">
          <span className="sr-only">Find a room or a person</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ash-gray" strokeWidth={1.7} aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a room or a person"
            className="h-[42px] w-full rounded-full border border-stone-border bg-white pr-4 pl-10 text-[13px] placeholder:text-ash-gray focus-visible:border-cyan-edge"
          />
        </label>
        <span className="ml-auto flex gap-2 max-md:w-full">
          <button type="button" onClick={() => setImporting(true)} className={cn(ghost, "max-md:flex-1 max-md:justify-center")}>
            <Upload className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Import
          </button>
          <button type="button" onClick={() => newRoom()} className={cn(ghost, "max-md:flex-1 max-md:justify-center")}>
            <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Add a room
          </button>
        </span>
      </div>

      {rooms.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-warm-gray tabular-nums" aria-live="polite">
          <span>
            <strong className="font-semibold text-ink-black">{shown.length}</strong> {shown.length === 1 ? "room" : "rooms"}
          </span>
          <span>
            <strong className="font-semibold text-ink-black">{total}</strong> beds
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] border border-dashed border-stone-muted bg-white" aria-hidden="true" />
            <strong className="font-semibold text-ink-black">{free}</strong> free
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-[#dcecfa] ring-1 ring-[#3398e1]/40 ring-inset" aria-hidden="true" /> Taken
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-[#d7efd7] ring-1 ring-st-paid/40 ring-inset" aria-hidden="true" />
            <strong className="font-semibold text-ink-black">{arrived}</strong> arrived
          </span>
        </p>
      )}

      {shown.length === 0 ? (
        rooms.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-[12px] border border-stone-border bg-white p-6">
            <p className="text-[17px] font-medium">No rooms yet</p>
            <p className="max-w-prose text-[15px] leading-relaxed text-warm-gray">
              Rooms appear here when someone starts a group, and Place everyone makes the rest. At the venue, open a room and type its real number.
            </p>
            <span className="flex flex-wrap gap-2">
              <Link href="?" className={`${primaryButtonClass} h-11 px-5`}>
                Place people
              </Link>
              <button type="button" onClick={() => setImporting(true)} className={cn(ghost, "h-11")}>
                <Upload className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Import a list
              </button>
            </span>
          </div>
        ) : (
          <p className="rounded-[12px] border border-dashed border-stone-muted px-4 py-5 text-sm text-warm-gray">
            {query ? <>No room or person matches &ldquo;{q}&rdquo;.</> : "No rooms of this kind yet."}
          </p>
        )
      ) : (
        groups.map((g) => {
          const gFree = g.rooms.reduce((n, r) => n + Math.max(0, r.capacity - r.occupied), 0);
          return (
            <section key={g.key} aria-labelledby={`g-${g.key}`} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 px-1">
                <h2 id={`g-${g.key}`} className="text-[14px] font-medium">
                  {g.name}
                  <span className="font-normal text-warm-gray">
                    {" "}
                    · {g.rooms.length} {g.rooms.length === 1 ? "room" : "rooms"} · {bedsWord(gFree)} free
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => newRoom(g.gender, g.typeId)}
                  aria-label={`Add a room to ${g.name}`}
                  className="cm-press -mr-2 inline-flex h-8 flex-none items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-cyan-deep hover:bg-cyan-tint"
                >
                  <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Add
                </button>
              </div>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,172px),1fr))] gap-3">
                {g.rooms.map((r) => (
                  <li key={r.id}>
                    <FloorPlan room={r} onOpen={() => setDraft({ id: r.id, label: r.label, room_type_id: r.room_type_id, gender: r.gender, capacity: r.capacity })} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      <Sheet
        open={!!draft}
        onClose={close}
        title={draft?.id ? editing?.label || draft.label || "Room" : "Add a room"}
        subtitle={editing ? `${who(editing.gender)} · ${editing.room_type_name}` : undefined}
        footer={
          !confirmDelete && (
            <>
              <button type="button" onClick={close} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={pending || !draft?.label.trim()} className={`${primaryButtonClass} flex-1`}>
                <Busy pending={pending} text="Saving…">
                  {draft?.id ? "Save" : "Add room"}
                </Busy>
              </button>
            </>
          )
        }
      >
        {draft && (
          <>
            {editing && (
              <div className="flex flex-col gap-2 rounded-[12px] bg-stone-rail p-4">
                <span className="flex items-baseline justify-between text-[13px] tabular-nums">
                  <span>
                    <strong className="font-semibold">{editing.occupied}</strong> of {editing.capacity} beds taken
                  </span>
                  <span className="text-warm-gray">
                    {editing.occupants.filter((o) => o.checked_in).length} arrived
                  </span>
                </span>
                <BedBar capacity={editing.capacity} taken={editing.occupied} arrived={editing.occupants.filter((o) => o.checked_in).length} />
              </div>
            )}
            <Field label="Name or number">
              <input autoFocus={!draft.id} className={inputClass} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="A03" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Room type">
                <select
                  className={inputClass}
                  value={draft.room_type_id}
                  onChange={(e) => setDraft({ ...draft, room_type_id: e.target.value, capacity: draft.id ? draft.capacity : roomTypes.find((t) => t.id === e.target.value)?.capacity ?? draft.capacity })}
                >
                  {roomTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="For">
                <select className={inputClass} value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value as Gender })}>
                  <option value="female">Women</option>
                  <option value="male">Men</option>
                </select>
              </Field>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium" id="beds-label">
                Beds
              </span>
              <span className="flex flex-wrap items-center gap-3">
                <Stepper
                  labelledBy="beds-label"
                  value={draft.capacity}
                  min={Math.max(1, editing?.occupied ?? 1)}
                  max={100}
                  onChange={(capacity) => setDraft({ ...draft, capacity })}
                />
                {editing && editing.occupied > 0 && <span className="text-[13px] text-warm-gray">Can&apos;t go below the {editing.occupied} already in it.</span>}
              </span>
            </div>
            {editing && editing.occupants.length > 0 && (
              <section className="flex flex-col">
                <h3 className="mb-1 text-[13px] font-semibold">In this room</h3>
                {editing.occupants.map((o) => (
                  <div key={o.registration_id} className="flex min-h-12 items-center gap-3 border-t border-stone-border text-sm">
                    {/* The same person panel as People and Requests. */}
                    <Link href={`/admin/camp/${campId}/people?person=${o.registration_id}`} className="flex flex-1 items-center gap-1.5 underline-offset-[3px] hover:underline">
                      <Arrived on={!!o.checked_in} />
                      {o.full_name}
                    </Link>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await unassignAction(o.registration_id);
                          if (!r.ok) return toast(r.error, { tone: "error" });
                          toast(`${o.full_name.split(" ")[0]} taken out of ${editing.label}`, {
                            action: {
                              label: "Undo",
                              run: () =>
                                start(async () => {
                                  const u = await assignPersonAction(editing.id, o.registration_id);
                                  toast(u.ok ? "Undone" : u.error, { tone: u.ok ? "ok" : "error" });
                                }),
                            },
                          });
                        })
                      }
                      className="cm-press h-9 rounded-full border border-stone-border bg-white px-3.5 text-[13px] font-medium"
                    >
                      Take out
                    </button>
                  </div>
                ))}
              </section>
            )}
            <ErrorText>{error}</ErrorText>
            {editing &&
              (confirmDelete ? (
                <InlineConfirm
                  question={`Delete ${editing.label}?`}
                  detail={editing.occupied ? `${editing.occupied} ${editing.occupied === 1 ? "person goes" : "people go"} back to waiting for a room.` : undefined}
                  confirmLabel="Yes, delete"
                  pending={pending}
                  onCancel={() => setConfirmDelete(false)}
                  onConfirm={() =>
                    start(async () => {
                      const r = await deleteRoomAction(editing.id);
                      if (!r.ok) return setError(r.error);
                      toast(`${editing.label} deleted`);
                      close();
                    })
                  }
                />
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="mt-2 inline-flex min-h-10 items-center gap-1.5 self-start text-sm text-warm-gray hover:text-ink-black">
                  <Trash2 className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Delete this room
                </button>
              ))}
          </>
        )}
      </Sheet>

      <ImportRooms open={importing} onClose={() => setImporting(false)} campId={campId} roomTypes={roomTypes} />
    </div>
  );
}

/** Bed columns in a room's plan: beds line two walls like a real room; big dorms get three or four. */
const planCols = (n: number) => (n <= 2 ? 1 : n <= 8 ? 2 : n <= 12 ? 3 : 4);

/**
 * A room as a square floor plan: one cell per bed with the first name of
 * whoever sleeps there. Green has arrived, blue is taken, a dashed cell is free.
 */
function FloorPlan({ room: r, onOpen }: { room: RoomWithOccupants; onOpen: () => void }) {
  const left = Math.max(0, r.capacity - r.occupied);
  const cols = planCols(r.capacity);
  const shown = Math.min(r.capacity, 16);
  const people = r.occupants.map((o) => o.full_name).join(", ");
  return (
    <button
      type="button"
      onClick={onOpen}
      title={people || undefined}
      aria-label={`${r.label}, ${r.occupied} of ${r.capacity} beds taken${people ? `: ${people}` : ""}. Open to edit.`}
      className="group cm-press flex aspect-square w-full flex-col gap-3 rounded-[14px] border border-stone-border bg-white p-3 text-left shadow-seline-card transition-[border-color,box-shadow] md:p-3.5 duration-200 hover:border-stone-muted hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)]"
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-display min-w-0 truncate text-[17px] whitespace-nowrap">{r.label}</span>
        <span className="flex-none text-[12px] tabular-nums">
          <span className="font-medium">{r.occupied}</span>
          <span className="text-warm-gray">/{r.capacity}</span>
        </span>
      </span>
      <span
        className="grid min-h-0 flex-1 gap-1 rounded-[10px] bg-stone-rail p-1 md:gap-1.5 md:p-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: "minmax(0, 1fr)" }}
        aria-hidden="true"
      >
        {Array.from({ length: shown }, (_, i) => {
          const o = r.occupants[i];
          return (
            <span
              key={i}
              className={cn(
                "flex min-h-0 min-w-0 items-center rounded-[6px] px-1.5 text-[12px] leading-none font-medium md:px-2",
                !o && "border border-dashed border-stone-muted bg-white/60",
                o && !o.checked_in && "bg-[#dcecfa] text-[#14558c]",
                o && o.checked_in && "bg-[#d7efd7] text-[#0b5e0b]",
              )}
            >
              {o && <span className="truncate">{o.full_name.split(" ")[0]}</span>}
            </span>
          );
        })}
      </span>
      <span className="flex items-center justify-between text-[12px] text-warm-gray">
        <span>{r.occupied === 0 ? "Empty" : left ? `${left} free` : "Full"}</span>
        <ChevronRight className="h-3.5 w-3.5 text-ash-gray transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.8} aria-hidden="true" />
      </span>
    </button>
  );
}

export function Stepper({ value, min, max, onChange, labelledBy, label = "Number" }: { value: number; min: number; max: number; onChange: (n: number) => void; labelledBy?: string; label?: string }) {
  return (
    <span role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label} className="inline-flex w-max items-center rounded-full border border-stone-muted bg-white">
      <button type="button" aria-label="One fewer" disabled={value <= min} onClick={() => onChange(value - 1)} className="cm-press flex h-11 w-11 items-center justify-center disabled:opacity-30">
        <Minus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
      </button>
      <input
        inputMode="numeric"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(0, n)));
        }}
        className="h-11 w-12 bg-transparent text-center text-[17px] tabular-nums"
      />
      <button type="button" aria-label="One more" disabled={value >= max} onClick={() => onChange(value + 1)} className="cm-press flex h-11 w-11 items-center justify-center disabled:opacity-30">
        <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
      </button>
    </span>
  );
}

export function ImportRooms({ open, onClose, campId, roomTypes }: { open: boolean; onClose: () => void; campId: string; roomTypes: RoomType[] }) {
  const toast = useToast();
  const [errors, setErrors] = useState<CsvError[]>([]);
  const [pending, start] = useOneAtATime();
  return (
    <Sheet open={open} onClose={onClose} title="Import rooms" subtitle="A spreadsheet saved as CSV">
      <p className="text-sm leading-relaxed">
        Columns: <strong className="font-semibold">label, room type, gender, beds</strong>. Room types: {roomTypes.map((t) => t.name).join(", ")}.
      </p>
      <label className={cn(primaryButtonClass, "cursor-pointer", pending && "opacity-60")}>
        <Upload className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
        <Busy pending={pending} text="Checking…">Choose a file</Busy>
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setErrors([]);
            start(async () => {
              const r = await importRoomsAction(campId, await file.text());
              if (!r.ok) return setErrors([{ line: 0, message: r.error }]);
              if (r.data.errors.length) return setErrors(r.data.errors);
              toast(`Imported ${r.data.created} rooms`);
              onClose();
            });
          }}
        />
      </label>
      {errors.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-[12px] border border-stone-border p-4 text-sm">
          <p className="font-semibold">Nothing was imported. Fix these first:</p>
          <ul className="max-h-60 overflow-y-auto">
            {errors.map((err, i) => (
              <li key={i}>
                {err.line > 0 && <span className="tabular-nums">Line {err.line}: </span>}
                {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
