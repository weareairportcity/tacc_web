"use client";

import { useRef, useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BedDouble, Church, CircleSlash, HeartPulse, Shirt, User } from "lucide-react";
import { formatCedis } from "@/lib/camp/money";
import { SHIRT_SIZES, type RegistrationInput, type RoomType } from "@/lib/camp/types";
import { HumanCheck, waitForHuman } from "@/components/camp/HumanCheck";
import { Busy } from "@/components/camp/brand";
import { placesState } from "@/components/camp/places";
import { ErrorText, Field, inputClass, primaryButtonClass, secondaryButtonClass, titleClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { registerAction } from "../actions";
import { FULL_NAME_PROBLEM, isFullName } from "@/lib/camp/names";

type Props = {
  slug: string;
  /** Off: skip the size question. The pass QR and T-shirt scanner still work. */
  shirtsOn?: boolean;
  /** Camp Settings: emergency contact and a health answer are required to register. */
  detailsRequired?: boolean;
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

export function RegisterForm({ slug, signedIn, roomTypes, fellowshipGroups, churches, shirtsOn = true, detailsRequired = false }: Props) {
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
    emergency_name: "",
    emergency_phone: "",
    health_notes: "",
    health_none: false,
  });
  const [error, setError] = useState("");
  const [errorAt, setErrorAt] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pending, startTransition] = useOneAtATime();
  const [human, setHuman] = useState("");
  const humanRef = useRef(human);
  humanRef.current = human;
  const [round, setRound] = useState(0);
  // About you (and emergency/health when the camp asks), then room type, then the code.
  const [step, setStep] = useState<1 | 2>(1);
  const aboutYou = useRef<HTMLDivElement>(null);

  const miss = (id: string, message: string) => {
    setErrorAt(id);
    setError(message);
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      const target =
        el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
          ? el
          : el?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:not(.sr-only), input, select, textarea");
      target?.focus({ preventScroll: true });
    });
    return false;
  };

  const checkAboutYou = () => {
    if (!isFullName(values.full_name)) return miss("full_name", FULL_NAME_PROBLEM);
    if (values.gender !== "female" && values.gender !== "male") return miss("gender", "Pick female or male so we can place you in the right room.");
    if (!values.phone.trim()) return miss("phone", "Enter your phone number.");
    if (!values.email.trim()) return miss("email", "Enter your email address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) return miss("email", "Enter a valid email address.");
    if (values.is_minor !== true && values.is_minor !== false) return miss("age", "Tell us whether you are under 18.");
    if (values.is_minor) {
      if (!String(values.guardian_name ?? "").trim()) return miss("guardian_name", "Enter your parent or guardian's name.");
      if (!String(values.guardian_phone ?? "").trim()) return miss("guardian_phone", "Enter your parent or guardian's phone number.");
      if (values.guardian_consent !== true) return miss("guardian_consent", "Tick that your parent or guardian knows you're registering and agrees.");
    }
    return true;
  };

  const checkRoom = () => {
    if (!values.fellowship) return miss("fellowship", "Choose your fellowship.");
    if (churches.length > 1 && !values.church) return miss("church", "Choose your church.");
    if (!values.room_type_id) return miss("room", "Pick a room type.");
    return true;
  };

  const checkDetails = () => {
    if (!String(values.emergency_name ?? "").trim()) return miss("emergency_name", "Enter who we should call in an emergency, and how they're related to you.");
    if (!String(values.emergency_phone ?? "").trim()) return miss("emergency_phone", "Enter the emergency contact's phone as a Ghana number, e.g. 024 555 0101.");
    if (!values.health_none && !String(values.health_notes ?? "").trim()) return miss("health_none", "Tell us about your health, or tick that you have no health conditions.");
    if (!values.health_none && String(values.health_notes ?? "").trim() && values.health_consent !== true) {
      return miss("health_consent", "Tick that you agree to us keeping your health notes, or leave them empty.");
    }
    return true;
  };

  const next = () => {
    if (!checkAboutYou()) return;
    if (detailsRequired && !checkDetails()) return;
    setError("");
    setErrorAt(null);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const mark = <K extends keyof RegistrationInput>(key: K, value: RegistrationInput[K], id?: string) => {
    if (id && errorAt === id) {
      setErrorAt(null);
      setError("");
    }
    set(key, value);
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
    if (!checkAboutYou() || (detailsRequired && !checkDetails())) {
      setStep(1);
      return;
    }
    if (!checkRoom()) {
      setStep(2);
      return;
    }
    setError("");
    setErrorAt(null);
    startTransition(async () => {
      const token = await waitForHuman(() => humanRef.current, () => setRound((n) => n + 1));
      const result = await registerAction(slug, values, token);
      if (!result.ok) {
        setRound((n) => n + 1);
        // If a room type filled while they were typing, keep everything and send them back to Room.
        if (/full|filled up/.test(result.error)) {
          set("room_type_id", "");
          document.getElementById("room")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        // Something about them (a phone, an email) needs fixing: back to step 1, everything kept.
        else if (/phone|email|name|gender|guardian|emergency|health/i.test(result.error)) setStep(1);
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
        <Link href={`/camps/${slug}/me#pay`} className={`${primaryButtonClass} h-[52px] w-full`}>
          Pay now
        </Link>
        <Link href={`/camps/${slug}/me`} className={`${secondaryButtonClass} h-12 w-full`}>
          Pay later, go to my home
        </Link>
        <p className="text-center text-[13px] text-warm-gray">Pay any time before the due date, all at once or in parts.</p>
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
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <Steps step={step} />
      {step === 1 && (
        <div ref={aboutYou} className="flex flex-col gap-5">
          <ErrorText>{error}</ErrorText>
          <fieldset className={cn(fieldsetClass, "cm-rise")}>
            <Legend icon={User}>About you</Legend>
            <Field label="Full name" hint="Your first name and surname, e.g. Ama Mensah.">
              <input
                id="full_name"
                required
                autoComplete="name"
                aria-invalid={errorAt === "full_name" || undefined}
                className={cn(inputClass, errorAt === "full_name" && "outline-2 outline-cyan-signal")}
                value={values.full_name}
                onChange={(e) => mark("full_name", e.target.value, "full_name")}
              />
            </Field>
            {errorAt === "full_name" && <ErrorText>{error}</ErrorText>}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium" id="gender-label">
                Gender
              </span>
              <div
                id="gender"
                role="radiogroup"
                aria-labelledby="gender-label"
                aria-invalid={errorAt === "gender" || undefined}
                className={cn("grid grid-cols-2 gap-1 rounded-full border border-stone-border bg-stone-canvas p-1", errorAt === "gender" && "outline-2 outline-cyan-signal")}
              >
                {(["female", "male"] as const).map((g) => (
                  <label
                    key={g}
                    className="cm-press flex h-10 cursor-pointer items-center justify-center rounded-full text-sm has-[:checked]:bg-soot has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-signal"
                  >
                    <input required type="radio" name="gender" value={g} checked={values.gender === g} onChange={() => { setGender(g); if (errorAt === "gender") { setErrorAt(null); setError(""); } }} className="sr-only" />
                    {g === "female" ? "Female" : "Male"}
                  </label>
                ))}
              </div>
            </div>
            {errorAt === "gender" && <ErrorText>{error}</ErrorText>}
            <Field label="Phone number">
              <input
                id="phone"
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="055 111 2222"
                aria-invalid={errorAt === "phone" || undefined}
                className={cn(inputClass, errorAt === "phone" && "outline-2 outline-cyan-signal")}
                value={values.phone}
                onChange={(e) => mark("phone", e.target.value, "phone")}
              />
            </Field>
            {errorAt === "phone" && <ErrorText>{error}</ErrorText>}
            <Field label="Email">
              <input
                id="email"
                required
                type="email"
                autoComplete="email"
                aria-invalid={errorAt === "email" || undefined}
                className={cn(inputClass, errorAt === "email" && "outline-2 outline-cyan-signal")}
                value={values.email}
                onChange={(e) => mark("email", e.target.value, "email")}
              />
            </Field>
            {errorAt === "email" && <ErrorText>{error}</ErrorText>}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium" id="age-label">
                Are you under 18?
              </span>
              <div
                id="age"
                role="radiogroup"
                aria-labelledby="age-label"
                aria-invalid={errorAt === "age" || undefined}
                className={cn("grid grid-cols-2 gap-1 rounded-full border border-stone-border bg-stone-canvas p-1", errorAt === "age" && "outline-2 outline-cyan-signal")}
              >
                {([false, true] as const).map((minor) => (
                  <label
                    key={String(minor)}
                    className="cm-press flex h-10 cursor-pointer items-center justify-center rounded-full text-sm has-[:checked]:bg-soot has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-signal"
                  >
                    <input required type="radio" name="is_minor" checked={values.is_minor === minor} onChange={() => mark("is_minor", minor, "age")} className="sr-only" />
                    {minor ? "Yes, under 18" : "No, 18 or over"}
                  </label>
                ))}
              </div>
            </div>
            {errorAt === "age" && <ErrorText>{error}</ErrorText>}
          </fieldset>
          {values.is_minor && (
            <fieldset className={cn(fieldsetClass, "cm-rise")}>
              <Legend icon={User}>Your parent or guardian</Legend>
              <p className="-mt-2 text-sm leading-relaxed text-warm-gray">Only coordinators see this, to reach them if they need to.</p>
              <Field label="Their name">
                <input
                  id="guardian_name"
                  required
                  aria-invalid={errorAt === "guardian_name" || undefined}
                  className={cn(inputClass, errorAt === "guardian_name" && "outline-2 outline-cyan-signal")}
                  value={values.guardian_name ?? ""}
                  onChange={(e) => mark("guardian_name", e.target.value, "guardian_name")}
                />
              </Field>
              {errorAt === "guardian_name" && <ErrorText>{error}</ErrorText>}
              <Field label="Their phone">
                <input
                  id="guardian_phone"
                  required
                  type="tel"
                  inputMode="tel"
                  placeholder="024 555 0101"
                  aria-invalid={errorAt === "guardian_phone" || undefined}
                  className={cn(inputClass, errorAt === "guardian_phone" && "outline-2 outline-cyan-signal")}
                  value={values.guardian_phone ?? ""}
                  onChange={(e) => mark("guardian_phone", e.target.value, "guardian_phone")}
                />
              </Field>
              {errorAt === "guardian_phone" && <ErrorText>{error}</ErrorText>}
              <label id="guardian_consent" className={cn("flex cursor-pointer items-start gap-3 rounded-[8px] p-1 text-[15px] leading-relaxed", errorAt === "guardian_consent" && "outline-2 outline-cyan-signal")}>
                <input
                  required
                  type="checkbox"
                  className="mt-1 h-5 w-5 flex-none accent-soot"
                  checked={values.guardian_consent === true}
                  onChange={(e) => mark("guardian_consent", e.target.checked, "guardian_consent")}
                />
                My parent or guardian knows I&apos;m registering and agrees to me coming to this camp.
              </label>
              {errorAt === "guardian_consent" && <ErrorText>{error}</ErrorText>}
            </fieldset>
          )}
          {detailsRequired && (
            <>
              <fieldset className={cn(fieldsetClass, "cm-rise")}>
                <Legend icon={HeartPulse}>In any case of emergency</Legend>
                <p className="-mt-2 text-sm leading-relaxed text-warm-gray">Who should we call in an emergency at camp?</p>
                <Field label="Their name" hint="And how they're related to you, e.g. Kofi Tetteh, father.">
                  <input
                    id="emergency_name"
                    aria-invalid={errorAt === "emergency_name" || undefined}
                    className={cn(inputClass, errorAt === "emergency_name" && "outline-2 outline-cyan-signal")}
                    value={values.emergency_name ?? ""}
                    onChange={(e) => mark("emergency_name", e.target.value, "emergency_name")}
                  />
                </Field>
                {errorAt === "emergency_name" && <ErrorText>{error}</ErrorText>}
                <Field label="Their phone">
                  <input
                    id="emergency_phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="024 555 0101"
                    aria-invalid={errorAt === "emergency_phone" || undefined}
                    className={cn(inputClass, errorAt === "emergency_phone" && "outline-2 outline-cyan-signal")}
                    value={values.emergency_phone ?? ""}
                    onChange={(e) => mark("emergency_phone", e.target.value, "emergency_phone")}
                  />
                </Field>
                {errorAt === "emergency_phone" && <ErrorText>{error}</ErrorText>}
              </fieldset>
              <fieldset className={cn(fieldsetClass, "cm-rise")}>
                <Legend icon={HeartPulse}>Your health</Legend>
                <p className="-mt-2 text-sm leading-relaxed text-warm-gray">Only coordinators see this.</p>
                <label
                  id="health_none"
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[12px] border p-3.5",
                    values.health_none ? "border-soot bg-stone-canvas" : "border-stone-border",
                    errorAt === "health_none" && "outline-2 outline-cyan-signal",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 flex-none accent-soot"
                    checked={values.health_none === true}
                    onChange={(e) => {
                      mark("health_none", e.target.checked, "health_none");
                      if (e.target.checked) mark("health_notes", "");
                    }}
                  />
                  <span className="text-[15px] leading-relaxed">I have no health conditions</span>
                </label>
                {errorAt === "health_none" && <ErrorText>{error}</ErrorText>}
                {!values.health_none && (
                  <Field label="Allergies, medicine or anything we should know">
                    <textarea
                      id="health_notes"
                      rows={3}
                      className={`${inputClass} h-auto py-2.5 leading-relaxed`}
                      value={values.health_notes ?? ""}
                      onChange={(e) => {
                        mark("health_notes", e.target.value, "health_notes");
                        if (e.target.value.trim()) mark("health_none", false);
                      }}
                    />
                  </Field>
                )}
                {!values.health_none && String(values.health_notes ?? "").trim() && (
                  <label
                    id="health_consent"
                    className={cn("flex cursor-pointer items-start gap-3 rounded-[8px] p-1 text-[15px] leading-relaxed", errorAt === "health_consent" && "outline-2 outline-cyan-signal")}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 flex-none accent-soot"
                      checked={values.health_consent === true}
                      onChange={(e) => mark("health_consent", e.target.checked, "health_consent")}
                    />
                    I agree to the church keeping this so coordinators can look after me at camp. I can remove it any time.
                  </label>
                )}
                {errorAt === "health_consent" && <ErrorText>{error}</ErrorText>}
              </fieldset>
            </>
          )}
          <button type="button" onClick={next} className={`${primaryButtonClass} h-[52px] w-full`}>
            Next: your room type
          </button>
        </div>
      )}

      {step === 2 && (
        <>
          <ErrorText>{error}</ErrorText>
          <fieldset className={cn(fieldsetClass, "cm-rise")}>
            <Legend icon={Church}>Your church</Legend>
            <Field label="Fellowship">
              <select
                id="fellowship"
                required
                aria-invalid={errorAt === "fellowship" || undefined}
                className={cn(inputClass, errorAt === "fellowship" && "outline-2 outline-cyan-signal")}
                value={values.fellowship}
                onChange={(e) => mark("fellowship", e.target.value, "fellowship")}
              >
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
            {errorAt === "fellowship" && <ErrorText>{error}</ErrorText>}
            {churches.length > 1 && (
              <Field label="Church">
                <select
                  id="church"
                  required
                  aria-invalid={errorAt === "church" || undefined}
                  className={cn(inputClass, errorAt === "church" && "outline-2 outline-cyan-signal")}
                  value={values.church}
                  onChange={(e) => mark("church", e.target.value, "church")}
                >
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
            {errorAt === "church" && <ErrorText>{error}</ErrorText>}
          </fieldset>

          <fieldset
            id="room"
            aria-invalid={errorAt === "room" || undefined}
            className={cn(fieldsetClass, "cm-rise scroll-mt-6 gap-2.5", errorAt === "room" && "outline-2 outline-cyan-signal")}
            style={{ animationDelay: "60ms" }}
          >
            <Legend icon={BedDouble}>Your room type</Legend>
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
                    onChange={() => mark("room_type_id", t.id, "room")}
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
                        {state} {state === 1 ? "place" : "places"} left
                      </span>
                    ) : (
                      <span className="text-[13px] text-warm-gray">Available</span>
                    )}
                  </span>
                  <span className={cn("font-display text-lg tabular-nums", full && "text-ash-gray")}>{formatCedis(t.price_pesewas)}</span>
                </label>
              );
            })}
          </fieldset>
          {errorAt === "room" && <ErrorText>{error}</ErrorText>}

          {shirtsOn && (
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
          )}

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
  const names = ["About you", "Your room type", "Your code"];
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
