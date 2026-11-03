"use client";

import { useRef, useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BedDouble, Church, CircleSlash, Shirt, User } from "lucide-react";
import { formatCedis } from "@/lib/camp/money";
import { SHIRT_SIZES, type RegistrationInput, type RoomType } from "@/lib/camp/types";
import { HumanCheck } from "@/components/camp/HumanCheck";
import { Busy } from "@/components/camp/brand";
import { placesState } from "@/components/camp/places";
import { ErrorText, Field, inputClass, primaryButtonClass, titleClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { registerAction } from "../actions";

type Props = {
  slug: string;
  signedIn: boolean;
  roomTypes: RoomType[];
  fellowshipGroups: { pfcc: string; names: string[] }[];
  churches: string[];
  dueOn?: string;
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

export function RegisterForm({ slug, signedIn, roomTypes, fellowshipGroups, churches }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<RegistrationInput>({
    full_name: "",
    phone: "",
    email: "",
    gender: "" as RegistrationInput["gender"],
    fellowship: "",
    church: churches.length === 1 ? churches[0] : "",
    room_type_id: "",
    shirt_size: "",
  });
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [pending, startTransition] = useOneAtATime();
  const [human, setHuman] = useState("");
  const [round, setRound] = useState(0);
  // Three short steps: about you, where you'll sleep, then your code.
  const [step, setStep] = useState<1 | 2>(1);
  const aboutYou = useRef<HTMLDivElement>(null);

  const next = () => {
    for (const field of aboutYou.current?.querySelectorAll<HTMLInputElement>("input, select") ?? []) {
      if (!field.checkValidity()) return field.reportValidity();
    }
    setError("");
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
      const result = await registerAction(slug, values, human);
      if (!result.ok) {
        setRound((n) => n + 1);
        // If a room type filled while they were typing, keep everything and send them back to Room.
        if (/full|filled up/.test(result.error)) {
          set("room_type_id", "");
          document.getElementById("room")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        // Something about them (a phone, an email) needs fixing: back to step 1, everything kept.
        else if (/phone|email|name|gender|guardian/i.test(result.error)) setStep(1);
        return setError(result.error);
      }
      // Already registered with this phone: sign in instead of a dead end.
      if ("registered" in result.data) return router.push(`/camps/${slug}/sign-in?registered=1`);
      setCode(result.data.code);
    });
  };

  if (code) {
    return (
      <section className="cm-rise flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-seline-hero">
        <Steps step={3} />
        <h2 className={titleClass}>You&apos;re registered</h2>
        <p className="text-[15px] leading-relaxed text-warm-gray">This is your sign-in code. We&apos;ve texted it to you too.</p>
        <p className="rounded-[10px] bg-stone-canvas py-5 text-center font-mono text-[26px] font-medium tracking-[0.08em] tabular-nums">{code}</p>
        <p className="rounded-[12px] bg-cyan-tint px-4 py-3 text-[15px] leading-relaxed">
          <strong className="font-semibold">Keep this code safe.</strong>{" "}Don&apos;t delete the text. You need the code each time you sign in on a new phone. Keep it to
          yourself.
        </p>
        <Link href={`/camps/${slug}/me`} className={`${primaryButtonClass} h-[52px] w-full`}>
          Continue to payment
        </Link>
        <p className="text-center text-[13px] text-warm-gray">You can pay later.</p>
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
      <Steps step={step} />
      {step === 1 && (
        <div ref={aboutYou} className="flex flex-col gap-5">
          <fieldset className={cn(fieldsetClass, "cm-rise")}>
            <Legend icon={User}>About you</Legend>
            <Field label="Full name">
              <input required autoComplete="name" className={inputClass} value={values.full_name} onChange={(e) => set("full_name", e.target.value)} />
            </Field>
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
            </div>
            <Field label="Phone number">
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
            <Field label="Email">
              <input required type="email" autoComplete="email" className={inputClass} value={values.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium" id="age-label">
                Are you under 18?
              </span>
              <div role="radiogroup" aria-labelledby="age-label" className="grid grid-cols-2 gap-1 rounded-full border border-stone-border bg-stone-canvas p-1">
                {([false, true] as const).map((minor) => (
                  <label
                    key={String(minor)}
                    className="cm-press flex h-10 cursor-pointer items-center justify-center rounded-full text-sm has-[:checked]:bg-soot has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-signal"
                  >
                    <input required type="radio" name="is_minor" checked={values.is_minor === minor} onChange={() => set("is_minor", minor)} className="sr-only" />
                    {minor ? "Yes, under 18" : "No, 18 or over"}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
          {values.is_minor && (
            <fieldset className={cn(fieldsetClass, "cm-rise")}>
              <Legend icon={User}>Your parent or guardian</Legend>
              <p className="-mt-2 text-sm leading-relaxed text-warm-gray">Only coordinators see this, to reach them if they need to.</p>
              <Field label="Their name">
                <input required className={inputClass} value={values.guardian_name ?? ""} onChange={(e) => set("guardian_name", e.target.value)} />
              </Field>
              <Field label="Their phone">
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  placeholder="024 555 0101"
                  className={inputClass}
                  value={values.guardian_phone ?? ""}
                  onChange={(e) => set("guardian_phone", e.target.value)}
                />
              </Field>
              <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-relaxed">
                <input
                  required
                  type="checkbox"
                  className="mt-1 h-5 w-5 flex-none accent-soot"
                  checked={values.guardian_consent === true}
                  onChange={(e) => set("guardian_consent", e.target.checked)}
                />
                My parent or guardian knows I&apos;m registering and agrees to me coming to this camp.
              </label>
            </fieldset>
          )}
          <button type="button" onClick={next} className={`${primaryButtonClass} h-[52px] w-full`}>
            Next: where you&apos;ll sleep
          </button>
        </div>
      )}

      {step === 2 && (
        <>
          <fieldset className={cn(fieldsetClass, "cm-rise")}>
            <Legend icon={Church}>Your church</Legend>
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

          <fieldset id="room" className={cn(fieldsetClass, "cm-rise scroll-mt-6 gap-2.5")} style={{ animationDelay: "60ms" }}>
            <Legend icon={BedDouble}>Where you&apos;ll sleep</Legend>
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
                  {/* How many share a room, as a number. */}
                  <span className={cn("flex h-14 w-14 flex-none flex-col items-center justify-center rounded-[12px]", full ? "bg-[#f0efee]" : "bg-stone-rail")}>
                    <span className={cn("font-display text-2xl leading-none", full && "text-warm-gray")}>{t.capacity}</span>
                    <span className="text-[10px] text-warm-gray">per room</span>
                  </span>
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
                        Only {state} {state === 1 ? "place" : "places"} left
                      </span>
                    ) : (
                      <span className="text-[13px] text-warm-gray">Places left</span>
                    )}
                  </span>
                  <span className={cn("font-display text-lg tabular-nums", full && "text-ash-gray")}>{formatCedis(t.price_pesewas)}</span>
                </label>
              );
            })}
          </fieldset>

          <fieldset className={cn(fieldsetClass, "cm-rise")} style={{ animationDelay: "120ms" }}>
            <Legend icon={Shirt}>Camp T-shirt</Legend>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium" id="shirt-label">
                Your size <span className="font-normal text-warm-gray">(you can skip this)</span>
              </span>
              <div role="radiogroup" aria-labelledby="shirt-label" className="grid grid-cols-4 gap-1.5">
                {SHIRT_SIZES.map((z) => (
                  <label
                    key={z}
                    className="cm-press flex h-11 cursor-pointer items-center justify-center rounded-full border border-stone-border bg-white text-sm font-medium has-[:checked]:border-soot has-[:checked]:bg-soot has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-signal"
                  >
                    <input type="radio" name="shirt" value={z} checked={values.shirt_size === z} onChange={() => set("shirt_size", z)} className="sr-only" />
                    {z}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          <div className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-seline-hero">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-warm-gray">Total{chosen ? ` · ${chosen.name}` : ""}</span>
              <span className="font-display text-[22px] tracking-[-0.02em] tabular-nums">
                {chosen ? formatCedis(chosen.price_pesewas) : "—"}
              </span>
            </div>
            <ErrorText>{error}</ErrorText>
            <HumanCheck onToken={setHuman} round={round} />
            <button type="submit" disabled={pending} aria-busy={pending} className={`${primaryButtonClass} h-[52px] w-full`}>
              <Busy pending={pending} text="Saving your place…">Register</Busy>
            </button>
            <p className="text-center text-[13px] text-warm-gray">
              Nothing to pay now. Registering means you agree to the{" "}
              <Link href="/camps/terms" className="underline underline-offset-[3px]">Terms</Link> and{" "}
              <Link href="/camps/privacy" className="underline underline-offset-[3px]">Privacy</Link> policy.
            </p>
        </div>
          <button type="button" disabled={pending} onClick={() => setStep(1)} className="self-center text-[15px] text-warm-gray underline underline-offset-[3px]">
            Back to about you
          </button>
        </>
      )}
    </form>
  );
}

/** "Step 1 of 3 · About you", with a bar per step: how far there is to go. */
function Steps({ step }: { step: 1 | 2 | 3 }) {
  const names = ["About you", "Where you'll sleep", "Your code"];
  return (
    <div className="flex flex-col gap-2" aria-label={`Step ${step} of 3: ${names[step - 1]}`}>
      <span aria-hidden="true" className="flex gap-1.5">
        {names.map((n, i) => (
          <span key={n} className={cn("h-1 flex-1 rounded-full", i < step ? "bg-soot" : "bg-stone-border")} />
        ))}
      </span>
      <span className="text-[13px] text-warm-gray">
        Step {step} of 3 · {names[step - 1]}
      </span>
    </div>
  );
}
