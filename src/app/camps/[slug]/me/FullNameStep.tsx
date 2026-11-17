"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { ErrorText, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { FULL_NAME_PROBLEM, isFullName } from "@/lib/camp/names";
import { saveFullNameAction } from "../actions";

/**
 * For people who registered with one name, before full names were required:
 * one question, first. "Later" hides it for this visit only; it comes back
 * until it's done.
 */
export function FullNameStep({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="full-name-title" className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-black/30 p-4 sm:items-center">
      <form
        className="cm-pop flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 shadow-[0_16px_40px_rgba(17,12,46,0.18)]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isFullName(value)) return setError(FULL_NAME_PROBLEM);
          start(async () => {
            setError("");
            const r = await saveFullNameAction(slug, value);
            if (!r.ok) return setError(r.error);
            setOpen(false);
            router.refresh();
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="full-name-title" className="font-display text-[24px] tracking-[-0.015em]">
            What&apos;s your full name?
          </h2>
          <p className="text-[15px] text-warm-gray">
            We only have &ldquo;{name}&rdquo;. Please add your surname so your pass, room list and receipts show your full name.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Full name</span>
          <input autoFocus autoComplete="name" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} placeholder="e.g. Ama Mensah" />
        </label>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending} aria-busy={pending} className={`${primaryButtonClass} h-12`}>
          {pending ? "Saving…" : "Save my name"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 text-[14px] text-warm-gray">
          Later
        </button>
      </form>
    </div>
  );
}
