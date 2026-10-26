"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleSlash, Plus, Trash2 } from "lucide-react";
import { formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import type { Gender, RoomType } from "@/lib/camp/types";
import { InlineConfirm, Sheet } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { deleteRoomTypeAction, saveRoomTypeAction, setPlacesLeftAction } from "../../actions";
import { Stepper } from "./AllRooms";

const who = (g: Gender) => (g === "male" ? "Men" : "Women");
const placesOf = (t: RoomType, g: Gender) => (g === "male" ? t.places_male : t.places_female);

type Venue = "plenty" | "few" | "none";
const venueOf = (n: number | null): Venue => (n === null ? "plenty" : n === 0 ? "none" : "few");

/**
 * Room types and how many places the venue says are left, per gender. The
 * number counts down by itself as people register; at 0 it shows Full.
 */
export function RoomTypesTab({ campId, roomTypes }: { campId: string; roomTypes: RoomType[] }) {
  const router = useRouter();
  const toast = useToast();
  const [places, setPlaces] = useState<{ type: RoomType; gender: Gender } | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; name: string; price: string; capacity: number } | null>(null);
  const [pending, start] = useTransition();

  /** Saves places left straight from the stepper, with Undo back to what it was. */
  const savePlaces = (type: RoomType, gender: Gender, value: number | null, before: number | null) =>
    start(async () => {
      const r = await setPlacesLeftAction(type.id, gender, value);
      if (!r.ok) return toast(r.error, { tone: "error" });
      toast(`${type.name} · ${who(gender)}: ${value === null ? "no limit" : value === 0 ? "full" : `${value} left`}`, {
        action: {
          label: "Undo",
          run: () =>
            start(async () => {
              const u = await setPlacesLeftAction(type.id, gender, before);
              toast(u.ok ? "Undone" : u.error, { tone: u.ok ? "ok" : "error" });
              router.refresh();
            }),
        },
      });
      setPlaces(null);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {roomTypes.length === 0 && <p className="rounded-[10px] border border-stone-border bg-white p-5 text-[15px] text-warm-gray">No room types yet.</p>}
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {roomTypes.map((t) => (
          <article key={t.id} className="flex flex-col rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h2 className="font-display text-[22px]">{t.name}</h2>
              <button
                type="button"
                onClick={() => setEdit({ id: t.id, name: t.name, price: pesewasToCedisInput(t.price_pesewas), capacity: t.capacity })}
                className="text-[13px] text-warm-gray underline-offset-[3px] hover:underline"
              >
                {formatCedis(t.price_pesewas).replace(/\.00$/, "")} · {t.capacity} beds · Edit
              </button>
            </div>
            <ul>
              {(["female", "male"] as const).map((g) => {
                const n = placesOf(t, g);
                return (
                  <li key={g} className="flex min-h-14 items-center gap-3 border-t border-stone-border py-2 text-sm">
                    <span className="w-16 font-medium">{who(g)}</span>
                    <span className="flex-1">
                      {n === null ? (
                        <span className="text-warm-gray">No limit</span>
                      ) : n === 0 ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <CircleSlash className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" /> Full
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <span className="cm-pulse h-[7px] w-[7px] rounded-full bg-cyan-signal" aria-hidden="true" /> {n} left
                        </span>
                      )}
                    </span>
                    {n !== null && n > 0 ? (
                      <Stepper value={n} min={0} max={9999} label={`${t.name} places left for ${who(g).toLowerCase()}`} onChange={(v) => savePlaces(t, g, v, n)} />
                    ) : (
                      <button type="button" onClick={() => setPlaces({ type: t, gender: g })} className="cm-press h-9 rounded-full border border-stone-border bg-white px-3.5 text-[13px] font-medium">
                        Set places
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setEdit({ id: null, name: "", price: "", capacity: 4 })}
        className="cm-press inline-flex h-10 items-center gap-2 self-start rounded-full border border-stone-border bg-white px-4 text-sm font-medium"
      >
        <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Add a room type
      </button>

      {places && (
        <PlacesSheet
          key={`${places.type.id}.${places.gender}`}
          type={places.type}
          gender={places.gender}
          pending={pending}
          onClose={() => setPlaces(null)}
          onSave={(value) => savePlaces(places.type, places.gender, value, placesOf(places.type, places.gender))}
        />
      )}
      {edit && <EditTypeSheet campId={campId} draft={edit} onClose={() => setEdit(null)} canDelete={!!edit.id} />}
    </div>
  );
}

function PlacesSheet({ type, gender, pending, onClose, onSave }: { type: RoomType; gender: Gender; pending: boolean; onClose: () => void; onSave: (value: number | null) => void }) {
  const current = placesOf(type, gender);
  const [venue, setVenue] = useState<Venue>(current === null ? "few" : venueOf(current));
  const [n, setN] = useState(current && current > 0 ? current : 5);
  const value = venue === "plenty" ? null : venue === "none" ? 0 : n;
  const choice = (v: Venue, label: string, extra?: React.ReactNode) => (
    <label className={cn("flex cursor-pointer flex-col gap-3 rounded-[12px] px-4 py-3.5", venue === v ? "border-2 border-soot bg-stone-canvas" : "border border-stone-border")}>
      <span className="flex items-center gap-3 text-[15px] font-medium">
        <input type="radio" name="venue" checked={venue === v} onChange={() => setVenue(v)} className="h-[18px] w-[18px] accent-soot" />
        {label}
      </span>
      {venue === v && extra}
    </label>
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
          <button type="button" disabled={pending || value === current} onClick={() => onSave(value)} className={`${primaryButtonClass} flex-1`}>
            {pending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div role="radiogroup" className="flex flex-col gap-2">
        {choice("plenty", "Plenty of rooms")}
        {choice(
          "few",
          "Only a few left",
          <span className="flex flex-wrap items-center gap-2 pl-[30px]">
            <Stepper value={n} min={1} max={9999} label="Places left" onChange={setN} />
            {[5, 10, 20].map((q) => (
              <button key={q} type="button" onClick={() => setN(q)} className={cn("cm-press h-9 rounded-full border px-3 text-[13px]", n === q ? "border-soot bg-soot text-white" : "border-stone-border bg-white")}>
                {q}
              </button>
            ))}
          </span>,
        )}
        {choice("none", "No more")}
      </div>
      <p className="text-[13px] text-warm-gray">Counts down as people register.</p>
    </Sheet>
  );
}

function EditTypeSheet({ campId, draft: initial, onClose, canDelete }: { campId: string; draft: { id: string | null; name: string; price: string; capacity: number }; onClose: () => void; canDelete: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
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
                  router.refresh();
                })
              }
              className={`${primaryButtonClass} flex-1`}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </>
        )
      }
    >
      <Field label="Name">
        <input autoFocus className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Hostel" />
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
                router.refresh();
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
