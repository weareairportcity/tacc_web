"use client";

import { Busy } from "@/components/camp/brand";
import { useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { CircleSlash, Infinity as InfinityIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import type { Gender, RoomType } from "@/lib/camp/types";
import { InlineConfirm, Sheet } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { placesLeft } from "@/components/camp/places";
import { deleteRoomTypeAction, saveRoomTypeAction, setPlacesLeftAction } from "../../actions";
import { Stepper } from "./AllRooms";

const ghost =
  "cm-press inline-flex h-10 items-center gap-2 rounded-full border border-stone-border bg-white px-4 text-[13px] font-medium text-ink-black transition-colors hover:border-stone-muted";
const who = (g: Gender) => (g === "male" ? "Men" : "Women");
const placesOf = (t: RoomType, g: Gender) => placesLeft(g === "male" ? t.places_male : t.places_female);
const totalOf = (t: RoomType, g: Gender) => placesLeft(g === "male" ? t.total_male : t.total_female);
const takenOf = (t: RoomType, g: Gender) => Number((g === "male" ? t.taken_male : t.taken_female) ?? 0);

type Venue = "plenty" | "total" | "few" | "none";
const venueOf = (left: number | null, total: number | null): Venue =>
  left === null ? "plenty" : total != null ? "total" : left === 0 ? "none" : "few";

/**
 * Room types and how many places the venue says are left, per gender. They
 * can type remaining places, or how many rooms there are (beds = rooms ×
 * beds a room, minus people already registered). Remaining counts down as
 * people register; at 0 it shows Full.
 */
export function RoomTypesTab({ campId, roomTypes }: { campId: string; roomTypes: RoomType[] }) {
  const toast = useToast();
  const [places, setPlaces] = useState<{ type: RoomType; gender: Gender } | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; name: string; price: string; capacity: number; subtext: string } | null>(null);
  const [pending, start] = useOneAtATime();

  /** Saves what the venue said, with Undo back to what it was. */
  const savePlaces = (type: RoomType, gender: Gender, value: number | null, total: number | null, asRooms = false) =>
    start(async () => {
      const beforeLeft = placesOf(type, gender);
      const beforeTotal = totalOf(type, gender);
      const r = await setPlacesLeftAction(type.id, gender, value, total, asRooms);
      if (!r.ok) return toast(r.error, { tone: "error" });
      const beds = asRooms && total != null ? total * type.capacity : total;
      const left = beds != null ? Math.max(0, beds - takenOf(type, gender)) : value;
      toast(`${type.name} · ${who(gender)}: ${left === null ? "no limit" : left === 0 ? "full" : beds != null ? `${left} of ${beds} beds left` : `${left} left`}`, {
        action: {
          label: "Undo",
          run: () =>
            start(async () => {
              const u = await setPlacesLeftAction(type.id, gender, beforeLeft, beforeTotal);
              toast(u.ok ? "Undone" : u.error, { tone: u.ok ? "ok" : "error" });
            }),
        },
      });
      setPlaces(null);
    });
  const add = () => setEdit({ id: null, name: "", price: "", capacity: 4, subtext: "" });

  return (
    <div className="flex flex-col gap-5">
      {roomTypes.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-[12px] border border-stone-border bg-white p-6">
          <p className="text-[17px] font-medium">No room types yet</p>
          <p className="max-w-prose text-[15px] leading-relaxed text-warm-gray">
            A room type is what people choose when they register, like &ldquo;Hostel&rdquo; or &ldquo;Two in a room with AC&rdquo;. It sets the price and how many beds a room has.
          </p>
          <button type="button" onClick={add} className={`${primaryButtonClass} h-11 px-5`}>
            <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Add a room type
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-prose text-[14px] leading-relaxed text-warm-gray">
              What people choose when they register. Set how many rooms there are, or how many places are left; remaining beds count down by themselves.
            </p>
            <button type="button" onClick={add} className={ghost}>
              <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Add a room type
            </button>
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {roomTypes.map((t) => (
              <li key={t.id} className="flex flex-col rounded-[12px] border border-stone-border bg-white shadow-seline-card">
                <div className="flex items-start justify-between gap-3 px-5 pt-5">
                  <div className="min-w-0">
                    <h2 className="font-display text-[22px] leading-tight text-balance">{t.name}</h2>
                    {t.subtext?.trim() ? <p className="mt-1 text-[14px] leading-snug text-warm-gray">{t.subtext.trim()}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEdit({ id: t.id, name: t.name, price: pesewasToCedisInput(t.price_pesewas), capacity: t.capacity, subtext: t.subtext ?? "" })}
                    aria-label={`Edit ${t.name}`}
                    className={cn(ghost, "h-9 flex-none px-3.5")}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" /> Edit
                  </button>
                </div>
                <dl className="flex gap-8 px-5 pt-3 pb-5">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[12px] text-warm-gray">Price</dt>
                    <dd className="font-display text-[26px] leading-none tabular-nums">{formatCedis(t.price_pesewas).replace(/\.00$/, "")}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[12px] text-warm-gray">Beds a room</dt>
                    <dd className="font-display text-[26px] leading-none tabular-nums">{t.capacity}</dd>
                  </div>
                </dl>
                <ul className="mt-auto border-t border-stone-border">
                  {(["female", "male"] as const).map((g) => {
                    const n = placesOf(t, g);
                    const total = totalOf(t, g);
                    return (
                      <li key={g} className="flex min-h-14 items-center gap-3 border-t border-stone-border px-5 py-2 text-sm first:border-t-0">
                        <span className="w-14 flex-none font-medium">{who(g)}</span>
                        <span className="flex-1">
                          {n === null ? (
                            <span className="inline-flex items-center gap-1.5 text-warm-gray">
                              <InfinityIcon className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> No limit
                            </span>
                          ) : n === 0 ? (
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              <CircleSlash className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
                              {total != null ? `Full · ${total} beds` : "Full. Can't be picked"}
                            </span>
                          ) : total != null ? (
                            <span className="inline-flex items-center gap-2 font-medium">
                              <span className="cm-pulse h-[7px] w-[7px] rounded-full bg-cyan-signal" aria-hidden="true" />
                              <span className="tabular-nums">{`${n} of ${total} beds left`}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2 font-medium">
                              <span className="cm-pulse h-[7px] w-[7px] rounded-full bg-cyan-signal" aria-hidden="true" />
                              <span className="tabular-nums">{`Only ${n} ${n === 1 ? "place" : "places"} left`}</span>
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPlaces({ type: t, gender: g })}
                          aria-label={`Change places left for ${who(g).toLowerCase()} in ${t.name}`}
                          className="cm-press -mr-2 h-9 flex-none rounded-full px-3 text-[13px] font-medium text-cyan-deep hover:bg-cyan-tint"
                        >
                          Change
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}

      {places && (
        <PlacesSheet
          key={`${places.type.id}.${places.gender}`}
          type={places.type}
          gender={places.gender}
          pending={pending}
          onClose={() => setPlaces(null)}
          onSave={(value, total, asRooms) => savePlaces(places.type, places.gender, value, total, asRooms)}
        />
      )}
      {edit && <EditTypeSheet campId={campId} draft={edit} onClose={() => setEdit(null)} canDelete={!!edit.id} />}
    </div>
  );
}

function countWord(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function PlacesSheet({
  type,
  gender,
  pending,
  onClose,
  onSave,
}: {
  type: RoomType;
  gender: Gender;
  pending: boolean;
  onClose: () => void;
  onSave: (value: number | null, total: number | null, asRooms?: boolean) => void;
}) {
  const current = placesOf(type, gender);
  const currentTotal = totalOf(type, gender);
  const taken = takenOf(type, gender);
  const bedsARoom = type.capacity;
  const roomsFromTotal = currentTotal != null && bedsARoom > 0 ? Math.max(1, Math.round(currentTotal / bedsARoom)) : null;
  const maxRooms = Math.max(1, Math.floor(10_000 / bedsARoom));
  const [venue, setVenue] = useState<Venue>(current === null ? "few" : venueOf(current, currentTotal));
  const [leftN, setLeftN] = useState(current && current > 0 ? current : 5);
  const [roomsN, setRoomsN] = useState(roomsFromTotal ?? 5);
  const bedsTotal = roomsN * bedsARoom;
  const leftover = Math.max(0, bedsTotal - taken);
  const totalToSave = venue === "total" ? roomsN : null;
  const value = venue === "plenty" ? null : venue === "none" ? 0 : venue === "total" ? roomsN : leftN;
  const unchanged =
    venue === "plenty"
      ? current === null
      : venue === "none"
        ? current === 0 && currentTotal == null
        : venue === "few"
          ? current === leftN && currentTotal == null
          : roomsFromTotal === roomsN;
  const choice = (v: Venue, label: string, extra?: React.ReactNode) => (
    <label className={cn("flex cursor-pointer flex-col gap-3 rounded-[12px] px-4 py-3.5", venue === v ? "border border-cyan-edge bg-cyan-tint shadow-[0_0_0_1px_#2f90da]" : "border border-stone-border hover:border-stone-muted")}>
      <span className="flex items-center gap-3 text-[15px] font-medium">
        <input type="radio" name="venue" checked={venue === v} onChange={() => setVenue(v)} className="h-[18px] w-[18px] accent-[#2f90da]" />
        {label}
      </span>
      {venue === v && extra}
    </label>
  );
  const chips = (n: number, set: (n: number) => void, qs: number[], label: string, max: number) => (
    <span className="flex flex-wrap items-center gap-2 pl-[30px]">
      <Stepper value={n} min={1} max={max} label={label} onChange={set} />
      {qs.map((q) => (
        <button key={q} type="button" onClick={() => set(q)} className={cn("cm-press h-9 rounded-full border px-3 text-[13px]", n === q ? "border-cyan-edge bg-white font-medium text-cyan-deep" : "border-stone-border bg-white")}>
          {q}
        </button>
      ))}
    </span>
  );
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${type.name} · ${who(gender)}`}
      subtitle="What did the venue say?"
      footer={
        <>
          <button type="button" onClick={onClose} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
            Cancel
          </button>
          <button type="button" disabled={pending || unchanged} onClick={() => onSave(value, totalToSave, venue === "total")} className={`${primaryButtonClass} flex-1`}>
            <Busy pending={pending} text="Saving…">Save</Busy>
          </button>
        </>
      }
    >
      <div role="radiogroup" className="flex flex-col gap-2">
        {choice("plenty", "Plenty of rooms. No limit")}
        {choice(
          "total",
          "This is the total",
          <>
            {chips(roomsN, (n) => setRoomsN(Math.min(maxRooms, n)), [5, 10, 20].filter((q) => q <= maxRooms), "Rooms", maxRooms)}
            <p className="pl-[30px] text-[13px] leading-relaxed text-warm-gray">
              {countWord(roomsN, "room", "rooms")} × {countWord(bedsARoom, "bed", "beds")} = {countWord(bedsTotal, "bed", "beds")}.{" "}
              {taken === 0
                ? "Counts down as people register."
                : leftover === 0
                  ? `${taken} already registered. It will show as Full. People already registered keep their place.`
                  : `${taken} already registered. ${countWord(leftover, "bed", "beds")} left.`}
            </p>
          </>,
        )}
        {choice("few", "Only a few left", chips(leftN, setLeftN, [5, 10, 20], "Places left", 9999))}
        {choice("none", "No more. Show it as Full")}
      </div>
      <p className="text-[13px] leading-relaxed text-warm-gray">Remaining beds count down as people register. At 0 it shows Full and can&apos;t be picked; people already registered keep their place.</p>
    </Sheet>
  );
}

function EditTypeSheet({ campId, draft: initial, onClose, canDelete }: { campId: string; draft: { id: string | null; name: string; price: string; capacity: number; subtext: string }; onClose: () => void; canDelete: boolean }) {
  const toast = useToast();
  const [draft, setDraft] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();
  return (
    <Sheet
      open
      onClose={onClose}
      title={draft.id ? initial.name : "Add a room type"}
      footer={
        !confirm && (
          <>
            <button type="button" onClick={onClose} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError("");
                  const r = await saveRoomTypeAction(campId, draft.id, draft);
                  if (!r.ok) return setError(r.error);
                  toast(`${draft.name.trim()} saved`);
                  onClose();
                })
              }
              className={`${primaryButtonClass} flex-1`}
            >
              <Busy pending={pending} text="Saving…">Save</Busy>
            </button>
          </>
        )
      }
    >
      <Field label="Name">
        <input autoFocus className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Hostel" />
      </Field>
      <Field label="Subtext" hint="Shown under the name when people register. You can leave it empty.">
        <textarea
          rows={2}
          maxLength={160}
          className={`${inputClass} h-auto py-2.5 leading-relaxed`}
          value={draft.subtext}
          onChange={(e) => setDraft({ ...draft, subtext: e.target.value })}
          placeholder="Shared bathroom, near the chapel…"
        />
      </Field>
      <Field label="Price" hint={draft.id ? "People already registered keep the price they signed up at." : undefined}>
        <span className="relative flex">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-warm-gray">GHS</span>
          <input inputMode="decimal" className={`${inputClass} pl-12 tabular-nums`} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
        </span>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" id="type-beds">
          Beds in a room
        </span>
        <Stepper labelledBy="type-beds" value={draft.capacity} min={1} max={100} onChange={(capacity) => setDraft({ ...draft, capacity })} />
      </div>
      <ErrorText>{error}</ErrorText>
      {canDelete &&
        (confirm ? (
          <InlineConfirm
            question={`Delete ${initial.name}?`}
            detail="Only possible while nobody has registered for it."
            confirmLabel="Yes, delete"
            pending={pending}
            onCancel={() => setConfirm(false)}
            onConfirm={() =>
              start(async () => {
                const r = await deleteRoomTypeAction(draft.id!);
                if (!r.ok) {
                  setConfirm(false);
                  return setError(r.error);
                }
                toast(`${initial.name} deleted`);
                onClose();
              })
            }
          />
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="inline-flex min-h-10 items-center gap-1.5 self-start text-sm">
            <Trash2 className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Delete room type
          </button>
        ))}
    </Sheet>
  );
}
