"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { useToast } from "@/components/camp/toast";
import { ErrorText, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { messageLeadersAction } from "../../actions";

/** A message to every leader's phone, in Commune Team. Free: leaders share codes, so it can't go by text. */
export function LeadersMessage({ campId, phones, codes }: { campId: string; phones: number; codes: number }) {
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();
  return (
    <section aria-label="Message the leaders" className="flex flex-col gap-3 rounded-[10px] border border-stone-border bg-white p-5 shadow-seline-card">
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold">Message the leaders</h2>
        <p className="flex items-center gap-1.5 text-[13px] text-warm-gray">
          <Bell className="h-3.5 w-3.5 text-[#0b5e0b]" strokeWidth={1.8} aria-hidden="true" />
          Goes to {phones} {phones === 1 ? "phone" : "phones"} across {codes} leader {codes === 1 ? "code" : "codes"} in Commune Team. Free; leaders without it set up won&apos;t get it.
        </p>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        maxLength={400}
        aria-label="Message to the leaders"
        placeholder="e.g. Please remind your people to choose roommates by Friday."
        className={`${inputClass} h-auto py-2.5 leading-relaxed`}
      />
      <ErrorText>{error}</ErrorText>
      <button
        type="button"
        disabled={pending || message.trim().length < 3 || phones === 0}
        onClick={() =>
          start(async () => {
            setError("");
            const r = await messageLeadersAction(campId, message);
            if (!r.ok) return setError(r.error);
            setMessage("");
            toast(r.data ? `Sent to ${r.data} leader ${r.data === 1 ? "phone" : "phones"}` : "No leader phone could be reached.", r.data ? undefined : { tone: "error" });
          })
        }
        className={`${primaryButtonClass} h-12 self-start px-6`}
      >
        <Busy pending={pending} text="Sending…">Send to leaders</Busy>
      </button>
    </section>
  );
}
