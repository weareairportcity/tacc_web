"use client";

import { Busy } from "@/components/camp/brand";
import { useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { Check } from "lucide-react";
import { SHIRT_SIZES, type Gender, type ProfileInput } from "@/lib/camp/types";
import { ErrorText, Field, inputClass, primaryButtonClass, titleClass, secondaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { changeMyGenderAction, updateMyDetailsAction } from "../../actions";
import { DeleteMe } from "../DeleteMe";

const fieldset = "m-0 flex flex-col gap-4 rounded-2xl border border-stone-border bg-white p-5 shadow-seline-card";

/** A section's title with one plain sentence on what it's for. */
const Legend = ({ title, sub }: { title: string; sub: string }) => (
  <legend className="float-left mb-1 flex w-full flex-col gap-1">
    <span className={titleClass}>{title}</span>
    <span className="text-sm font-normal leading-relaxed text-warm-gray">{sub}</span>
  </legend>
);

type GenderState = { now: Gender; inGroup: boolean; room: string | null; canChange: boolean };

export function DetailsForm({
  slug,
  phone,
  initial,
  cancelled,
  gender,
  healthAgreed,
  shirtsOn = true,
  paid = 0,
}: {
  /** What they've paid, for the refund line when removing themselves. */
  paid?: number;
  slug: string;
  /** The camp has a camp T-shirt; off hides the size question. */
  shirtsOn?: boolean;
  phone: string;
  initial: ProfileInput;
  cancelled: boolean;
  gender: GenderState;
  /** They already ticked the health agreement; it isn't asked again. */
  healthAgreed: boolean;
}) {
  const [v, setV] = useState(initial);
  const [showHealth, setShowHealth] = useState(!!initial.health_notes);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useOneAtATime();
  const set = (k: keyof ProfileInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setV({ ...v, [k]: e.target.value });
  };

  return (
    <>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError("");
            const r = await updateMyDetailsAction(slug, v);
            if (!r.ok) return setError(r.error);
            setSaved(true);
          });
        }}
      >
        <fieldset className={fieldset}>
          <Legend title="About you" sub="So we know who you are at camp." />
          <Field label="Full name">
            <input required autoComplete="name" className={inputClass} value={v.full_name} onChange={set("full_name")} />
          </Field>
          <Field label="Phone number" hint="To change it, ask a coordinator.">
            <input readOnly aria-readonly className={`${inputClass} bg-stone-canvas text-[#57534e]`} value={/^233\d{9}$/.test(phone) ? `0${phone.slice(3)}` : phone} />
          </Field>
          <Field label="Email" hint="For your receipts.">
            <input required type="email" autoComplete="email" className={inputClass} value={v.email} onChange={set("email")} />
          </Field>
          {shirtsOn && <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" id="shirt-label">
              T-shirt size
            </span>
            <div role="radiogroup" aria-labelledby="shirt-label" className="grid grid-cols-4 gap-1.5">
              {SHIRT_SIZES.map((z) => (
                <label
                  key={z}
                  className="cm-press flex h-11 cursor-pointer items-center justify-center rounded-full border border-stone-border bg-white text-sm font-medium has-[:checked]:border-soot has-[:checked]:bg-soot has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-signal"
                >
                  <input type="radio" name="shirt" value={z} checked={v.shirt_size === z} onChange={() => { setSaved(false); setV({ ...v, shirt_size: z }); }} className="sr-only" />
                  {z}
                </label>
              ))}
            </div>
          </div>}
        </fieldset>

        <fieldset className={cn(fieldset, !initial.emergency_name && "ring-2 ring-cyan-signal")}>
          <Legend title="If something happens" sub="Who should we call in an emergency at camp?" />
          <Field label="Their name" hint="And how they're related to you, e.g. Kofi Tetteh, father.">
            <input className={inputClass} value={v.emergency_name} onChange={set("emergency_name")} />
          </Field>
          <Field label="Their phone">
            <input type="tel" inputMode="tel" className={inputClass} value={v.emergency_phone} onChange={set("emergency_phone")} placeholder="024 555 0101" />
          </Field>
        </fieldset>

        {showHealth ? (
          <fieldset className={fieldset}>
            <Legend title="Your health" sub="Only coordinators see this. Leave it empty if there's nothing." />
            <Field label="Allergies, medicine or anything we should know">
              <textarea rows={3} autoFocus={!initial.health_notes} className={`${inputClass} h-auto py-2.5 leading-relaxed`} value={v.health_notes} onChange={set("health_notes")} />
            </Field>
            {!healthAgreed && v.health_notes.trim() && (
              <label className="cm-rise flex cursor-pointer items-start gap-3 text-[15px] leading-relaxed">
                <input
                  required
                  type="checkbox"
                  className="mt-1 h-5 w-5 flex-none accent-soot"
                  checked={v.health_consent === true}
                  onChange={(e) => setV({ ...v, health_consent: e.target.checked })}
                />
                I agree to the church keeping this so coordinators can look after me at camp. I can remove it any time.
              </label>
            )}
          </fieldset>
        ) : (
          // Most people have nothing to add: the box stays out of the way until asked for.
          <button type="button" onClick={() => setShowHealth(true)} className={`${secondaryButtonClass} h-12 w-full text-[15px]`}>
            Add allergies, medicine or a health need
          </button>
        )}

        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending} aria-busy={pending} className={`${primaryButtonClass} h-[52px] w-full`}>
          <Busy pending={pending} text="Saving…">Save my details</Busy>
        </button>
        {saved && (
          <p role="status" className="cm-rise flex items-center justify-center gap-2 text-sm">
            <Check className="h-4 w-4 text-st-paid" strokeWidth={2.4} aria-hidden="true" /> Saved
          </p>
        )}
      </form>

      {!cancelled && <GenderSection slug={slug} gender={gender} />}

      <section className="mt-4 flex flex-col gap-3 border-t border-stone-border pt-5">
        <h2 className="text-[15px] font-semibold">Delete my details</h2>
        <p className="text-sm text-warm-gray">{cancelled ? "Removes everything about you from Commune." : "This cancels your place at camp and removes everything about you."}</p>
        <DeleteMe slug={slug} cancelled={cancelled} paid={paid} />
      </section>
    </>
  );
}

/** Gender, with what changing it means for their room and group. Saved on its own, after a confirm. */
function GenderSection({ slug, gender }: { slug: string; gender: GenderState }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useOneAtATime();
  const to: Gender = gender.now === "male" ? "female" : "male";
  const leaves = [gender.inGroup && "your roommate group", gender.room && `room ${gender.room}`].filter(Boolean);

  return (
    <section className="mt-4 flex flex-col gap-3 border-t border-stone-border pt-5">
      <h2 className="text-[15px] font-semibold">Gender</h2>
      <p className="text-sm text-warm-gray">
        You&apos;re down as <span className="font-medium text-soot">{gender.now}</span>.
        {gender.canChange ? " Rooms are for men or women, so this decides your room." : " Rooms are being finalised. To change this, ask a coordinator."}
      </p>
      {done && (
        <p role="status" className="cm-rise flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-st-paid" strokeWidth={2.4} aria-hidden="true" /> Changed. A coordinator will give you a room.
        </p>
      )}
      {gender.canChange &&
        (confirm ? (
          <div role="alertdialog" aria-label="Confirm" className="cm-pop flex flex-col gap-3 rounded-[12px] border-2 border-soot p-4">
            <p className="text-[15px] font-semibold">Change to {to}?</p>
            <p className="text-sm">
              {leaves.length ? `You'll leave ${leaves.join(" and ")}. ` : ""}A coordinator will give you a {to === "male" ? "men's" : "women's"} room.
            </p>
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirm(false)} className="cm-press h-11 rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
                Keep {gender.now}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError("");
                    const r = await changeMyGenderAction(slug, to);
                    if (!r.ok) return setError(r.error);
                    setConfirm(false);
                    setDone(true);
                  })
                }
                className="cm-press h-11 flex-1 rounded-full bg-soot px-4 text-sm font-medium text-white"
              >
                <Busy pending={pending} text="Changing…">{`Yes, change to ${to}`}</Busy>
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDone(false);
              setConfirm(true);
            }}
            className="cm-press inline-flex h-12 items-center gap-2 self-start rounded-full border border-stone-border bg-white px-5 text-sm font-medium"
          >
            Change to {to}
          </button>
        ))}
    </section>
  );
}
