"use client";

import { cn } from "@/lib/utils";
import type { Delivery } from "@/lib/camp/message-cost";

const OPTIONS: { id: Delivery; label: string; hint: string }[] = [
  { id: "app", label: "In the app", hint: "A notification if they have it on, a text if they don't." },
  { id: "text", label: "Text", hint: "A text message. Costs credits." },
  { id: "both", label: "Both", hint: "Notification and a text. Costs credits for everyone." },
];

/** Coordinators pick how a message goes: app first, text, or both. */
export function HowPick({ value, onChange }: { value: Delivery; onChange: (how: Delivery) => void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-0.5 text-sm font-medium">How to send it</legend>
      <div role="radiogroup" aria-label="How to send it" className="flex flex-col gap-1.5">
        {OPTIONS.map((o) => (
          <label
            key={o.id}
            className={cn(
              "cm-press flex cursor-pointer items-start gap-3 rounded-[12px] border px-3.5 py-3",
              value === o.id ? "border-soot bg-stone-canvas" : "border-stone-border bg-white",
            )}
          >
            <input type="radio" name="how" value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} className="mt-0.5 h-4 w-4 flex-none accent-soot" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-medium">{o.label}</span>
              <span className="text-[13px] leading-snug text-warm-gray">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
