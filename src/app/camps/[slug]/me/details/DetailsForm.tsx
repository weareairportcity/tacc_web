"use client";

import { Busy } from "@/components/camp/brand";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, HeartPulse, Lock, Trash2 } from "lucide-react";
import { SHIRT_SIZES, type ProfileInput } from "@/lib/camp/types";
import { ErrorText, Field, inputClass, primaryButtonClass, titleClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { deleteMyDetailsAction, updateMyDetailsAction } from "../../actions";

const fieldset = "m-0 flex flex-col gap-4 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card";

export function DetailsForm({ slug, phone, initial, cancelled }: { slug: string; phone: string; initial: ProfileInput; cancelled: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
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
            router.refresh();
          });
        }}
      >
        <fieldset className={fieldset}>
          <legend className={`float-left mb-1 w-full ${titleClass}`}>About you</legend>
          <Field label="Full name">
            <input required autoComplete="name" className={inputClass} value={v.full_name} onChange={set("full_name")} />
          </Field>
          <Field label="Phone number" hint="To change it, ask a coordinator.">
            <input readOnly aria-readonly className={`${inputClass} bg-stone-canvas text-[#57534e]`} value={/^233\d{9}$/.test(phone) ? `0${phone.slice(3)}` : phone} />
          </Field>
          <Field label="Email">
            <input required type="email" autoComplete="email" className={inputClass} value={v.email} onChange={set("email")} />
          </Field>
          <div className="flex flex-col gap-1.5">
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
          </div>
        </fieldset>

        <fieldset className={cn(fieldset, !initial.emergency_name && "ring-2 ring-cyan-signal")}>
          <legend className={`float-left mb-1 flex w-full items-center gap-2 ${titleClass}`}>
            <HeartPulse className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" /> For emergencies
          </legend>
          <p className="flex items-center gap-2 text-[13px] text-warm-gray">
            <Lock className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" /> Only coordinators see this.
          </p>
          <Field label="Who should we call?">
            <input className={inputClass} value={v.emergency_name} onChange={set("emergency_name")} placeholder="Name and relation" />
          </Field>
          <Field label="Their phone">
            <input type="tel" inputMode="tel" className={inputClass} value={v.emergency_phone} onChange={set("emergency_phone")} placeholder="024 555 0101" />
          </Field>
          <Field label="Health notes">
            <textarea rows={3} className={`${inputClass} h-auto py-2.5 leading-relaxed`} value={v.health_notes} onChange={set("health_notes")} placeholder="Allergies, medicine" />
          </Field>
        </fieldset>

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

      <section className="mt-4 flex flex-col gap-3 border-t border-stone-border pt-5">
        <h2 className="text-[15px] font-semibold">Delete my details</h2>
        <p className="text-sm text-warm-gray">{cancelled ? "Removes your details from Commune." : "Cancels your registration and removes your details."}</p>
        {confirm ? (
          <div role="alertdialog" aria-label="Confirm" className="cm-pop flex flex-col gap-3 rounded-[12px] border-2 border-soot p-4">
            <p className="text-[15px] font-semibold">Delete your details? This can&apos;t be undone.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirm(false)} className="cm-press h-11 rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
                Keep them
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await deleteMyDetailsAction(slug);
                    if (!r.ok) {
                      setConfirm(false);
                      return setError(r.error);
                    }
                    router.replace(`/camps/${slug}`);
                  })
                }
                className="cm-press h-11 flex-1 rounded-full bg-soot px-4 text-sm font-medium text-white"
              >
                <Busy pending={pending} text="Deleting…">Yes, delete</Busy>
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="cm-press inline-flex h-10 items-center gap-2 self-start rounded-full border border-stone-border bg-white px-4 text-sm font-medium">
            <Trash2 className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Delete my details
          </button>
        )}
      </section>
    </>
  );
}
