"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CAMP_STATUSES, type Camp, type CampInput } from "@/lib/camp/types";
import { saveCampAction } from "./actions";
import { ErrorText, Field, buttonClass, inputClass } from "./ui";

const EMPTY: CampInput = {
  name: "",
  venue: "",
  starts_on: "",
  ends_on: "",
  registration_opens_on: "",
  registration_closes_on: "",
  payment_due_on: "",
  roommate_deadline_on: "",
  min_first_payment_pct: 30,
  status: "draft",
};

const DATE_FIELDS: { key: keyof CampInput; label: string }[] = [
  { key: "starts_on", label: "Camp starts" },
  { key: "ends_on", label: "Camp ends" },
  { key: "registration_opens_on", label: "Registration opens" },
  { key: "registration_closes_on", label: "Registration closes" },
  { key: "payment_due_on", label: "Full payment due" },
  { key: "roommate_deadline_on", label: "Roommate groups lock" },
];

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
    <form onSubmit={submit} className="space-y-4">
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
        <Field label="Venue">
          <input className={inputClass} value={values.venue} onChange={(e) => set("venue", e.target.value)} />
        </Field>
        {DATE_FIELDS.map(({ key, label }) => (
          <Field key={key} label={label}>
            <input
              required
              type="date"
              className={inputClass}
              value={values[key] as string}
              onChange={(e) => set(key, e.target.value)}
            />
          </Field>
        ))}
        <Field label="Minimum first payment (% of room price)">
          <input
            required
            type="number"
            min={1}
            max={100}
            className={inputClass}
            value={values.min_first_payment_pct}
            onChange={(e) => set("min_first_payment_pct", Number(e.target.value))}
          />
        </Field>
        <Field label="Status">
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
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {camp ? "Save changes" : "Create camp"}
        </button>
        {saved && <span className="text-sm text-emerald-700">Saved</span>}
      </div>
    </form>
  );
}
