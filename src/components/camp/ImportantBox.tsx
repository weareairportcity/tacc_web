"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Important": the message goes by text to everyone, and to the app too for people who have it. */
export function ImportantBox({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-[14px] border p-3.5", checked ? "border-[#b54708] bg-[#fffaeb]" : "border-stone-border")}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-soot" />
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[15px] font-medium">
          <AlertCircle className="h-4 w-4 text-[#b54708]" strokeWidth={1.8} aria-hidden="true" /> Important: send by text as well
        </span>
        <span className="text-[13px] leading-snug text-warm-gray">Everyone gets a text, and people with the app get a notification too. Costs credits for everyone.</span>
      </span>
    </label>
  );
}
