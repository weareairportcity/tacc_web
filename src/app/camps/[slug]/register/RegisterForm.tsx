"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BedDouble, Church, CircleSlash, Lock, User, Users } from "lucide-react";
import { formatCedis } from "@/lib/camp/money";
import type { RegistrationInput, RoomType } from "@/lib/camp/types";
import { CommuneLoader } from "@/components/camp/brand";
import { placesState } from "@/components/camp/places";
import { ErrorText, Field, formatDate, inputClass, primaryButtonClass, titleClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { registerAction } from "../actions";

type Props = {
  slug: string;
  signedIn: boolean;
  roomTypes: RoomType[];
  fellowshipGroups: { pfcc: string; names: string[] }[];
  churches: string[];
  dueOn: string;
};

const fieldsetClass = "m-0 flex flex-col gap-4 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card";

function Legend({ icon: Icon, children }: { icon: typeof User; children: React.ReactNode }) {
  return (
    <legend className={`float-left mb-1 flex w-full items-center gap-2 ${titleClass}`}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
      {children}
    </legend>
  );
}

export function RegisterForm({ slug, signedIn, roomTypes, fellowshipGroups, churches, dueOn }: Props) {
  const [values, setValues] = useState<RegistrationInput>({
    full_name: "",
    phone: "",
    email: "",
    gender: "" as RegistrationInput["gender"],
    fellowship: "",
    church: churches.length === 1 ? churches[0] : "",
    room_type_id: "",
  });
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof RegistrationInput>(key: K, value: RegistrationInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const chosen = roomTypes.find((t) => t.id === values.room_type_id);
  // A room type that's full for the chosen gender can't stay picked.
  const setGender = (gender: RegistrationInput["gender"]) =>
    setValues((v) => {
      const type = roomTypes.find((t) => t.id === v.room_type_id);
      return { ...v, gender, room_type_id: type && placesState(type, gender) === "full" ? "" : v.room_type_id };
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await registerAction(slug, values);
      if (!result.ok) {
        // If a room type filled while they were typing, keep everything and send them back to Room.
        if (/full|filled up/.test(result.error)) {
          set("room_type_id", "");
          document.getElementById("room")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return setError(result.error);
      }
      setCode(result.data.code);
    });
  };

  if (code) {
    return (
      <section className="cm-rise flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-seline-hero">
        <h2 className={titleClass}>You&apos;re registered</h2>
        <p className="text-[15px] leading-relaxed text-warm-gray">
          This is your sign-in code. We&apos;ve texted it to you too. Keep it private: anyone with it can open your
          registration.
        </p>
        <p className="rounded-[10px] bg-stone-canvas py-5 text-center font-mono text-3xl font-medium tracking-[0.2em]">{code}</p>
        <Link href={`/camps/${slug}/me`} className={`${primaryButtonClass} h-[52px] w-full`}>
          Continue to payment
        </Link>
        <p className="text-center text-[13px] text-warm-gray">Nothing to pay yet if you&apos;d rather pay later.</p>
      </section>
    );
  }

  if (signedIn) {
    return (
      <section className="flex flex-col gap-4 rounded-[10px] border border-stone-border bg-white p-5">
        <h2 className={titleClass}>You&apos;re already registered</h2>
        <Link href={`/camps/${slug}/me`} className={`${primaryButtonClass} w-full`}>
          Go to your registration
        </Link>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset className={cn(fieldsetClass, "cm-rise")}>
        <Legend icon={User}>About you</Legend>
        <Field label="Full name">
          <input required autoComplete="name" className={inputClass} value={values.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </Field>
        <Field label="Phone number" hint="Your sign-in code is texted here. MoMo payments can use it too.">
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="055 111 2222"
            className={inputClass}
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>
        <Field label="Email" hint="For your Paystack receipts.">
          <input required type="email" autoComplete="email" className={inputClass} value={values.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
      </fieldset>

      <fieldset className={cn(fieldsetClass, "cm-rise")} style={{ animationDelay: "60ms" }}>
        <Legend icon={Church}>Your church</Legend>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium" id="gender-label">
            Gender
          </span>
          <div role="radiogroup" aria-labelledby="gender-label" className="grid grid-cols-2 gap-1 rounded-full border border-stone-border bg-stone-canvas p-1">
            {(["female", "male"] as const).map((g) => (
              <label
                key={g}
                className="cm-press flex h-10 cursor-pointer items-center justify-center rounded-full text-sm has-[:checked]:bg-soot has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-signal"
              >
                <input required type="radio" name="gender" value={g} checked={values.gender === g} onChange={() => setGender(g)} className="sr-only" />
                {g === "female" ? "Female" : "Male"}
              </label>
            ))}
          </div>
          <span className="text-[13px] text-warm-gray">Rooms are for one gender, so this decides who you can room with.</span>
        </div>
        <Field label="Fellowship">
          <select required className={inputClass} value={values.fellowship} onChange={(e) => set("fellowship", e.target.value)}>
            <option value="" disabled>
              Choose your fellowship
            </option>
            {fellowshipGroups.map((g) => (
              <optgroup key={g.pfcc} label={g.pfcc}>
                {g.names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        {churches.length > 1 && (
          <Field label="Church">
            <select required className={inputClass} value={values.church} onChange={(e) => set("church", e.target.value)}>
              <option value="" disabled>
                Choose
              </option>
              {churches.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        )}
      </fieldset>

      <fieldset id="room" className={cn(fieldsetClass, "cm-rise scroll-mt-6 gap-2.5")} style={{ animationDelay: "120ms" }}>
        <Legend icon={BedDouble}>Room</Legend>
        {roomTypes.map((t) => {
          const state = placesState(t, values.gender);
          const full = state === "full";
          return (
            <label
              key={t.id}
              aria-disabled={full || undefined}
              className={cn(
                "flex items-center gap-3 rounded-[10px] border px-4 py-3.5",
                full
                  ? "cursor-not-allowed border-dashed border-stone-muted bg-stone-canvas"
                  : "cm-press cursor-pointer border-stone-border has-[:checked]:border-2 has-[:checked]:border-soot has-[:checked]:bg-stone-canvas has-[:checked]:px-[15px] has-[:checked]:py-[13px]",
              )}
            >
              <input
                required
                type="radio"
                name="room_type"
                value={t.id}
                disabled={full}
                checked={values.room_type_id === t.id}
                onChange={() => set("room_type_id", t.id)}
                className="h-[18px] w-[18px] accent-soot"
              />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className={cn("text-[15px] font-medium", full && "text-warm-gray")}>{t.name}</span>
                {full ? (
                  <span className="flex items-center gap-1.5 text-[13px] text-warm-gray">
                    <CircleSlash className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                    Full for {values.gender === "male" ? "men" : "women"}
                  </span>
                ) : typeof state === "number" ? (
                  <span className="flex items-center gap-1.5 text-[13px]">
                    <span className="cm-pulse h-1.5 w-1.5 flex-none rounded-full bg-cyan-signal" />
                    Only {state} {state === 1 ? "place" : "places"} left · {t.capacity} in a room
                  </span>
                ) : (
                  <span className="text-[13px] text-warm-gray">{t.capacity} in a room</span>
                )}
              </span>
              <span className={cn("font-display text-lg tabular-nums", full && "text-ash-gray")}>{formatCedis(t.price_pesewas)}</span>
            </label>
          );
        })}
        {!values.gender && <p className="text-[13px] text-warm-gray">Choose your gender above to see which rooms have places.</p>}
        <p className="mt-1.5 flex items-start gap-2.5 text-[13px] leading-relaxed text-warm-gray">
          <Users className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.5} aria-hidden="true" />
          Coming with friends? Pick the same room type: a roommate group fills one room.
        </p>
      </fieldset>

      <div className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-seline-hero">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-warm-gray">Total{chosen ? ` · ${chosen.name}` : ""}</span>
          <span className="font-display text-[22px] tracking-[-0.02em] tabular-nums">
            {chosen ? formatCedis(chosen.price_pesewas) : "—"}
          </span>
        </div>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending} aria-busy={pending} className={`${primaryButtonClass} h-[52px] w-full`}>
          {pending && <CommuneLoader size={22} label={null} />}
          {pending ? "Saving your place…" : "Register"}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-[13px] text-warm-gray">
          <Lock className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
          Nothing to pay yet. Pay in parts by {formatDate(dueOn)}.
        </p>
      </div>
    </form>
  );
}
