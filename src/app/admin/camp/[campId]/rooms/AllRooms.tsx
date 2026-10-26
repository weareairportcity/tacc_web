"use client";

import { Busy } from "@/components/camp/brand";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, Upload } from "lucide-react";
import type { CsvError } from "@/lib/camp/csv";
import type { Gender, RoomType, RoomWithOccupants } from "@/lib/camp/types";
import { InlineConfirm, Sheet } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { assignPersonAction, deleteRoomAction, importRoomsAction, saveRoomAction, unassignAction } from "../../actions";
import { Arrived, Beds } from "./AssignBoard";

type Draft = { id: string | null; label: string; room_type_id: string; gender: Gender; capacity: number };

/** Every room and who's in it. A room opens in a side panel to edit; nothing here is a separate page. */
export function AllRooms({ campId, rooms, roomTypes }: { campId: string; rooms: RoomWithOccupants[]; roomTypes: RoomType[] }) {
  const router = useRouter();
  const toast = useToast();
  const [gender, setGender] = useState<"" | Gender>("");
  const [type, setType] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const shown = useMemo(() => rooms.filter((r) => (!gender || r.gender === gender) && (!type || r.room_type_id === type)), [rooms, gender, type]);
  const editing = draft?.id ? rooms.find((r) => r.id === draft.id) : null;
  const beds = shown.reduce((n, r) => n + r.capacity, 0);

  if (!roomTypes.length) {
    return <p className="rounded-[10px] border border-stone-border bg-white p-5 text-[15px] text-warm-gray">Add a room type first, on Room types.</p>;
  }

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
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Women or men" value={gender} onChange={(e) => setGender(e.target.value as "" | Gender)} className="h-10 rounded-full border border-stone-border bg-white px-3.5 text-[13px]">
          <option value="">Women and men</option>
          <option value="female">Women</option>
          <option value="male">Men</option>
        </select>
        <select aria-label="Room type" value={type} onChange={(e) => setType(e.target.value)} className="h-10 rounded-full border border-stone-border bg-white px-3.5 text-[13px]">
          <option value="">All room types</option>
          {roomTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="text-[13px] text-warm-gray">
          {shown.length} rooms · {beds} beds
        </span>
        <span className="flex items-center gap-3 text-xs text-warm-gray max-md:hidden" aria-hidden="true">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-edge" />Taken</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-st-paid" />Arrived</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full border border-stone-muted" />Free</span>
        </span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={() => setImporting(true)} className="cm-press inline-flex h-10 items-center gap-2 rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
            <Upload className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Import
          </button>
          <button
            type="button"
            onClick={() => setDraft({ id: null, label: "", room_type_id: type || roomTypes[0].id, gender: gender || "female", capacity: roomTypes.find((t) => t.id === (type || roomTypes[0].id))?.capacity ?? 4 })}
            className="cm-press inline-flex h-10 items-center gap-2 rounded-full bg-soot px-4 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Add a room
          </button>
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-[10px] border border-stone-border bg-white p-5 text-[15px] text-warm-gray">No rooms yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {shown.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setDraft({ id: r.id, label: r.label, room_type_id: r.room_type_id, gender: r.gender, capacity: r.capacity })}
              className="cm-press flex flex-col gap-2 rounded-[10px] border border-stone-border bg-white p-3.5 text-left shadow-seline-card"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="font-display text-xl">{r.label}</span>
                <Beds capacity={r.capacity} taken={r.occupied} arrived={r.occupants.filter((o) => o.checked_in).length} />
              </span>
              <span className="text-xs text-warm-gray">
                {r.room_type_name} · {r.gender === "male" ? "Men" : "Women"}
              </span>
              <span className="flex flex-col text-[13px]">
                {r.occupants.length ? (
                  r.occupants.map((o) => (
                    <span key={o.registration_id} className="flex items-center gap-1.5">
                      <Arrived on={!!o.checked_in} />
                      <span className="truncate">{o.full_name}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-warm-gray">Empty</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={!!draft}
        onClose={close}
        title={draft?.id ? draft.label || "Room" : "Add a room"}
        subtitle={editing ? `${editing.room_type_name} · ${editing.occupied} of ${editing.capacity}` : undefined}
        footer={
          !confirmDelete && (
            <>
              <button type="button" onClick={close} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={pending || !draft?.label.trim()} className={`${primaryButtonClass} flex-1`}>
                <Busy pending={pending} text="Saving…">Save</Busy>
              </button>
            </>
          )
        }
      >
        {draft && (
          <>
            <Field label="Name or number">
              <input autoFocus className={inputClass} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="A03" />
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
              <Stepper
                labelledBy="beds-label"
                value={draft.capacity}
                min={Math.max(1, editing?.occupied ?? 1)}
                max={100}
                onChange={(capacity) => setDraft({ ...draft, capacity })}
              />
            </div>
            {editing && editing.occupants.length > 0 && (
              <section className="flex flex-col">
                <h3 className="mb-1 text-[13px] font-semibold">In this room</h3>
                {editing.occupants.map((o) => (
                  <div key={o.registration_id} className="flex min-h-11 items-center gap-3 border-t border-[#f0efee] text-sm">
                    <span className="flex flex-1 items-center gap-1.5">
                      <Arrived on={!!o.checked_in} />
                      {o.full_name}
                    </span>
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
                                  router.refresh();
                                }),
                            },
                          });
                          router.refresh();
                        })
                      }
                      className="cm-press h-8 rounded-full border border-stone-border bg-white px-3 text-xs font-medium"
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
                      router.refresh();
                    })
                  }
                />
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex min-h-10 items-center gap-1.5 self-start text-sm">
                  <Trash2 className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Delete room
                </button>
              ))}
          </>
        )}
      </Sheet>

      <ImportSheet open={importing} onClose={() => setImporting(false)} campId={campId} roomTypes={roomTypes} />
    </div>
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

function ImportSheet({ open, onClose, campId, roomTypes }: { open: boolean; onClose: () => void; campId: string; roomTypes: RoomType[] }) {
  const router = useRouter();
  const toast = useToast();
  const [errors, setErrors] = useState<CsvError[]>([]);
  const [pending, start] = useTransition();
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
              router.refresh();
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
