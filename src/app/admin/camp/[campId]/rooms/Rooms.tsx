"use client";

import { CommuneLoader } from "@/components/camp/brand";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import type { CsvError } from "@/lib/camp/csv";
import type { Gender, Room, RoomInput, RoomType } from "@/lib/camp/types";
import { deleteRoomAction, importRoomsAction, saveRoomAction } from "../../actions";
import { Card, ErrorText, Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/camp/ui";

type Draft = RoomInput & { id: string | null };

export function Rooms({ campId, rooms, roomTypes }: { campId: string; rooms: Room[]; roomTypes: RoomType[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? rooms.filter((r) => `${r.label} ${r.room_type_name} ${r.gender}`.toLowerCase().includes(q))
      : rooms;
  }, [rooms, filter]);

  const beds = rooms.reduce((sum, r) => sum + r.capacity, 0);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setError("");
    startTransition(async () => {
      const { id, ...input } = draft;
      const result = await saveRoomAction(campId, id, input);
      if (!result.ok) return setError(result.error);
      setDraft(null);
      router.refresh();
    });
  };

  // First click arms the button, second deletes.
  const remove = (room: Room) => {
    if (confirming !== room.id) return setConfirming(room.id);
    setConfirming(null);
    setError("");
    startTransition(async () => {
      const result = await deleteRoomAction(room.id);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  };

  const startNew = () => {
    const type = roomTypes[0];
    setDraft({ id: null, label: "", room_type_id: type?.id ?? "", gender: "female", capacity: type?.capacity ?? 1 });
  };

  if (roomTypes.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-stone-muted bg-white p-8 text-center text-sm text-warm-gray">
        Add a room type on the camp page before adding rooms.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <ImportRooms campId={campId} roomTypes={roomTypes} />

      <Card
        title={`Rooms · ${rooms.length} rooms, ${beds} beds`}
        action={
          !draft && (
            <button className={secondaryButtonClass} onClick={startNew}>
              <Plus className="h-4 w-4" /> Add room
            </button>
          )
        }
      >
        <div className="space-y-4">
          {draft && (
            <form
              onSubmit={save}
              className="grid gap-3 rounded-[10px] border border-stone-border p-4 sm:grid-cols-[1fr_1fr_8rem_6rem_auto] sm:items-end"
            >
              <Field label="Label">
                <input
                  required
                  className={inputClass}
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="H-304"
                />
              </Field>
              <Field label="Room type">
                <select
                  className={inputClass}
                  value={draft.room_type_id}
                  onChange={(e) => {
                    const type = roomTypes.find((t) => t.id === e.target.value);
                    setDraft({ ...draft, room_type_id: e.target.value, capacity: type?.capacity ?? draft.capacity });
                  }}
                >
                  {roomTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Gender">
                <select
                  className={inputClass}
                  value={draft.gender}
                  onChange={(e) => setDraft({ ...draft, gender: e.target.value as Gender })}
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </Field>
              <Field label="Beds">
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  className={inputClass}
                  value={draft.capacity}
                  onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })}
                />
              </Field>
              <div className="flex gap-2">
                <button type="submit" disabled={pending} className={buttonClass}>
                  {pending && <CommuneLoader size={18} label={null} />}
                  Save
                </button>
                <button type="button" className={secondaryButtonClass} onClick={() => setDraft(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          <ErrorText>{error}</ErrorText>

          {rooms.length > 0 && (
            <input
              className={inputClass}
              placeholder="Filter by label, type or gender"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}

          {rooms.length === 0 ? (
            <p className="text-sm text-warm-gray">No rooms yet. Add them one by one or import the venue&apos;s list.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ash-gray">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Room</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Gender</th>
                    <th className="py-2 pr-3 text-right font-medium">In room</th>
                    <th className="py-2 pr-3 text-right font-medium">Beds</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-border">
                  {shown.map((room) => (
                    <tr key={room.id}>
                      <td className="py-2 pr-3 font-medium">{room.label}</td>
                      <td className="py-2 pr-3">{room.room_type_name}</td>
                      <td className="py-2 pr-3 capitalize">{room.gender}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{room.occupied}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{room.capacity}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          aria-label={`Edit ${room.label}`}
                          className="rounded p-1.5 text-ash-gray hover:bg-stone-canvas hover:text-ink-black"
                          onClick={() =>
                            setDraft({
                              id: room.id,
                              label: room.label,
                              room_type_id: room.room_type_id,
                              gender: room.gender,
                              capacity: room.capacity,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={`Delete ${room.label}`}
                          disabled={pending}
                          className={
                            confirming === room.id
                              ? "rounded bg-ink-black px-2 py-1 text-xs font-medium text-white"
                              : "rounded p-1.5 text-ash-gray hover:bg-stone-canvas hover:text-ink-black"
                          }
                          onClick={() => remove(room)}
                          onBlur={() => setConfirming(null)}
                        >
                          {confirming === room.id ? (
                            room.occupied ? `Delete? ${room.occupied} go back to Unassigned` : "Delete?"
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ImportRooms({ campId, roomTypes }: { campId: string; roomTypes: RoomType[] }) {
  const router = useRouter();
  const [errors, setErrors] = useState<CsvError[]>([]);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setErrors([]);
    setMessage("");
    startTransition(async () => {
      const result = await importRoomsAction(campId, await file.text());
      if (!result.ok) return setErrors([{ line: 0, message: result.error }]);
      if (result.data.errors.length) return setErrors(result.data.errors);
      setMessage(`Imported ${result.data.created} rooms.`);
      router.refresh();
    });
  };

  return (
    <Card title="Import from CSV">
      <div className="space-y-3 text-sm">
        <p className="text-warm-gray">
          Columns: <code>label, room type, gender, capacity</code>. Room type must match one of:{" "}
          {roomTypes.map((t) => t.name).join(", ")}. Capacity is optional and defaults to the room type&apos;s beds.
          The whole file is checked first; nothing is saved unless every row is valid.
        </p>
        <label className={`${secondaryButtonClass} cursor-pointer`}>
          {pending ? <CommuneLoader size={18} label={null} /> : <Upload className="h-4 w-4" />}
          Choose CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {message && <p className="text-ink-black">{message}</p>}
        {errors.length > 0 && (
          <div className="rounded-[10px] border border-stone-border bg-white p-3">
            <p className="font-medium text-ink-black">Nothing was imported. Fix these and try again:</p>
            <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-ink-black">
              {errors.map((err, i) => (
                <li key={i}>
                  {err.line > 0 && <span className="font-mono">Line {err.line}: </span>}
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
