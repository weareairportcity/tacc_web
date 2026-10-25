"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleSlash, Clock } from "lucide-react";
import type { Gender, RoomType } from "@/lib/camp/types";
import { CommuneLoader } from "@/components/camp/brand";
import { ErrorText, Field, inputClass, primaryButtonClass, titleClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { setPlacesLeftAction } from "../../actions";

type Mode = "none" | "number" | "full";

const modeOf = (n: number | null): Mode => (n === null ? "none" : n === 0 ? "full" : "number");
const placesOf = (t: RoomType, g: Gender) => (g === "male" ? t.places_male : t.places_female);

/**
 * When the venue says "only N left", a coordinator records it here, per room
 * type and gender. Registrations count it down; at 0 attendees see Full.
 */
export function PlacesLeft({ roomTypes }: { roomTypes: RoomType[] }) {
  const router = useRouter();
  const [typeId, setTypeId] = useState(roomTypes[0]?.id ?? "");
  const [gender, setGender] = useState<Gender>("female");
  const type = roomTypes.find((t) => t.id === typeId);
  const current = type ? placesOf(type, gender) : null;
  const [mode, setMode] = useState<Mode>(modeOf(current));
  const [count, setCount] = useState(current && current > 0 ? String(current) : "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Picking another room type or gender shows what's saved for it.
  const load = (t: RoomType | undefined, g: Gender) => {
    const n = t ? placesOf(t, g) : null;
    setMode(modeOf(n));
    setCount(n && n > 0 ? String(n) : "");
    setError("");
    setSaved(false);
  };

  if (!type) return null;

  const value = mode === "none" ? null : mode === "full" ? 0 : Number(count);
  const invalid = mode === "number" && (!/^\d+$/.test(count.trim()) || Number(count) < 1);
  const unchanged = value === current;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return setError("Enter how many places are left, 1 or more. Choose Full for none.");
    setError("");
    startTransition(async () => {
      const result = await setPlacesLeftAction(type.id, gender, value);
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  };

  const who = gender === "male" ? "men" : "women";
  return (
    <form onSubmit={save} className="cm-rise flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-seline-hero">
      <h2 className={titleClass}>Places left</h2>
      <p className="text-[13px] leading-relaxed text-warm-gray">
        When the venue tells you how many are left, set it here. It counts down with each registration and closes the room
        type at 0. People already registered keep their place.
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-2.5">
        <Field label="Room type">
          <select
            className={inputClass}
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              load(roomTypes.find((t) => t.id === e.target.value), gender);
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
          <select
            className={inputClass}
            value={gender}
            onChange={(e) => {
              setGender(e.target.value as Gender);
              load(type, e.target.value as Gender);
            }}
          >
            <option value="female">Women</option>
            <option value="male">Men</option>
          </select>
        </Field>
      </div>
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 text-sm font-medium">Taking registrations</legend>
        <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-full border border-stone-border bg-stone-canvas p-1">
          {(
            [
              ["none", "No limit"],
              ["number", "Set number"],
              ["full", "Full"],
            ] as const
          ).map(([m, label]) => (
            <label
              key={m}
              className="cm-press flex h-9 cursor-pointer items-center justify-center rounded-full text-[13px] has-[:checked]:bg-soot has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-signal"
            >
              <input
                type="radio"
                name="places-mode"
                className="sr-only"
                checked={mode === m}
                onChange={() => {
                  setMode(m);
                  setSaved(false);
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {mode === "number" && (
        <Field label="Places left now" hint={`For ${who}. Type what the venue says.`}>
          <input
            inputMode="numeric"
            autoFocus
            className={cn(inputClass, "max-w-28 text-base tabular-nums")}
            value={count}
            onChange={(e) => {
              setCount(e.target.value);
              setSaved(false);
            }}
          />
        </Field>
      )}
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={pending || unchanged} aria-busy={pending} className={cn(primaryButtonClass, "w-full")}>
        {pending && <CommuneLoader size={20} label={null} />}
        {saved && unchanged ? (
          <>
            <Check className="h-4 w-4" aria-hidden="true" /> Saved
          </>
        ) : (
          "Save"
        )}
      </button>
      <p className="flex items-start gap-2 text-[12px] leading-relaxed text-warm-gray">
        {mode === "full" ? (
          <CircleSlash className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={1.7} aria-hidden="true" />
        ) : (
          <Clock className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={1.7} aria-hidden="true" />
        )}
        {mode === "none"
          ? `Anyone can pick ${type.name} as long as registration is open.`
          : mode === "full"
            ? `${type.name} shows as Full for ${who} and can't be picked.`
            : `Attendees see "Only ${invalid ? "N" : count.trim()} places left" for ${who}. At 0 it shows as Full.`}
      </p>
    </form>
  );
}
