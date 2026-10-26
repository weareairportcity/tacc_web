"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { CAMP_STATUSES, type Camp, type CampInput } from "@/lib/camp/types";
import { saveCampAction } from "./actions";
import { ErrorText, Field, inputClass, primaryButtonClass } from "@/components/camp/ui";

const EMPTY: CampInput = {
  name: "",
  venue: "",
  starts_on: "",
  ends_on: "",
  registration_opens_on: "",
  registration_closes_on: "",
  payment_due_on: "",
  roommate_deadline_on: "",
  fee_bps: 195,
  status: "draft",
};

const DATE_FIELDS: { key: keyof CampInput; label: string; hint?: string }[] = [
  { key: "starts_on", label: "Camp starts" },
  { key: "ends_on", label: "Camp ends" },
  { key: "registration_opens_on", label: "Registration opens", hint: "Before this, the camp page shows a countdown." },
  { key: "registration_closes_on", label: "Registration closes" },
  { key: "payment_due_on", label: "Full payment due", hint: "Shown to attendees with what’s outstanding." },
  { key: "roommate_deadline_on", label: "Roommate groups lock", hint: "After this, groups are final and you assign rooms." },
];

const STATUS_HINTS: Record<string, string> = {
  draft: "Draft: only coordinators can see it.",
  open: "Open: shown on /camps. Takes registrations between the dates above.",
  closed: "Closed: no new registrations. People can still pay and sign in.",
  archived: "Archived: hidden from attendees.",
};

/** Create a camp (no `camp`) or edit one. */
export function CampForm({ camp, onDone }: { camp?: Camp; onDone?: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<CampInput>(() =>
    camp ? (Object.fromEntries(Object.keys(EMPTY).map((k) => [k, camp[k as keyof CampInput]])) as CampInput) : EMPTY,
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof CampInput>(key: K, value: CampInput[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await saveCampAction(camp?.id ?? null, values);
      if (!result.ok) return setError(result.error);
      if (camp) {
        setSaved(true);
        router.refresh();
      } else {
        router.push(`/admin/camp/${result.data}`);
      }
      onDone?.();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Camp name">
          <input
            required
            className={inputClass}
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Mid Year Camp 2027"
          />
        </Field>
        <Field label="Venue" hint="Where attendees should go, e.g. Anagkazo Bible School.">
          <input className={inputClass} value={values.venue} onChange={(e) => set("venue", e.target.value)} />
        </Field>
        {DATE_FIELDS.map(({ key, label, hint }) => (
          <Field key={key} label={label} hint={hint}>
            <input
              required
              type="date"
              className={inputClass}
              value={values[key] as string}
              onChange={(e) => set(key, e.target.value)}
            />
          </Field>
        ))}
        <Field label="Paystack fee added to each payment (%)" hint="Attendees see it before they pay. 0 means the church covers it.">
          <input
            required
            type="number"
            min={0}
            max={20}
            step={0.01}
            className={inputClass}
            value={values.fee_bps / 100}
            onChange={(e) => set("fee_bps", Math.round(Number(e.target.value) * 100))}
          />
        </Field>
        <Field label="Status" hint={STATUS_HINTS[values.status]}>
          <select
            className={inputClass}
            value={values.status}
            onChange={(e) => set("status", e.target.value as CampInput["status"])}
          >
            {CAMP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} aria-busy={pending} className={primaryButtonClass}>
          <Busy pending={pending} text="Saving…">{camp ? "Save changes" : "Create camp"}</Busy>
        </button>
        {saved && (
          <span role="status" className="flex items-center gap-1.5 text-sm">
            <Check className="h-4 w-4" aria-hidden="true" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
