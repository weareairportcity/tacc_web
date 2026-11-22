"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Busy } from "@/components/camp/brand";
import { Sheet } from "@/components/camp/sheet";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import type { ProfileInput } from "@/lib/camp/types";
import { updateMyDetailsAction } from "../../actions";

/** Can't continue on their pages until emergency contact and health are answered. */
export function DetailsGate({
  slug,
  identity,
  emergencyName,
  emergencyPhone,
  healthNotes,
  healthNone,
  healthAgreed,
}: {
  slug: string;
  identity: Pick<ProfileInput, "full_name" | "email" | "shirt_size">;
  emergencyName: string;
  emergencyPhone: string;
  healthNotes: string;
  healthNone: boolean;
  healthAgreed: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const [name, setName] = useState(emergencyName);
  const [phone, setPhone] = useState(emergencyPhone);
  const [notes, setNotes] = useState(healthNotes);
  const [none, setNone] = useState(healthNone && !healthNotes);
  const [consent, setConsent] = useState(healthAgreed);
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();
  // The details page is the same form; cancel must stay reachable.
  if (path.endsWith("/details") || path.endsWith("/cancel")) return null;
  const miss = (id: string, message: string) => {
    setError(message);
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el instanceof HTMLElement && el.focus({ preventScroll: true });
    });
    return false;
  };

  return (
    <Sheet open locked onClose={() => undefined} title="Before you continue" subtitle="Who we should call if something happens at camp, and anything about your health.">
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return miss("gate_emergency_name", "Enter who we should call in an emergency, and how they're related to you.");
          if (!phone.trim()) return miss("gate_emergency_phone", "Enter the emergency contact's phone as a Ghana number, e.g. 024 555 0101.");
          if (!notes.trim() && !none) return miss("gate_health_none", "Tell us about your health, or tick that you have no health conditions.");
          if (notes.trim() && !healthAgreed && !consent) return miss("gate_health_consent", "Tick that you agree to us keeping your health notes, or leave them empty.");
          setError("");
          start(async () => {
            const r = await updateMyDetailsAction(slug, {
              ...identity,
              emergency_name: name,
              emergency_phone: phone,
              health_notes: none ? "" : notes,
              health_none: none,
              health_consent: consent,
            });
            if (!r.ok) return setError(r.error);
            router.refresh();
          });
        }}
      >
        <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
          <legend className="mb-1 text-[15px] font-semibold">If something happens</legend>
          <Field label="Their name" hint="And how they're related to you, e.g. Kofi Tetteh, father.">
            <input id="gate_emergency_name" autoComplete="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Their phone">
            <input id="gate_emergency_phone" type="tel" inputMode="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 555 0101" />
          </Field>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
          <legend className="mb-1 text-[15px] font-semibold">Your health</legend>
          <p className="-mt-2 text-sm leading-relaxed text-warm-gray">Only coordinators see this.</p>
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-[12px] border p-3.5",
              none ? "border-soot bg-stone-canvas" : "border-stone-border",
            )}
          >
            <input
              id="gate_health_none"
              type="checkbox"
              className="mt-0.5 h-5 w-5 flex-none accent-soot"
              checked={none}
              onChange={(e) => {
                setNone(e.target.checked);
                if (e.target.checked) setNotes("");
              }}
            />
            <span className="text-[15px] leading-relaxed">I have no health conditions</span>
          </label>
          {!none && (
            <Field label="Allergies, medicine or anything we should know">
              <textarea
                id="gate_health_notes"
                rows={3}
                className={`${inputClass} h-auto py-2.5 leading-relaxed`}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  if (e.target.value.trim()) setNone(false);
                }}
              />
            </Field>
          )}
          {!healthAgreed && notes.trim() && !none && (
            <label id="gate_health_consent" className="flex cursor-pointer items-start gap-3 text-[15px] leading-relaxed">
              <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-soot" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              I agree to the church keeping this so coordinators can look after me at camp. I can remove it any time.
            </label>
          )}
        </fieldset>

        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending} aria-busy={pending} className={`${primaryButtonClass} h-[52px] w-full`}>
          <Busy pending={pending} text="Saving…">Save and continue</Busy>
        </button>
      </form>
    </Sheet>
  );
}
