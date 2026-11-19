"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, HeartPulse } from "lucide-react";
import type { LeaderCode } from "@/lib/camp/leaders";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { InlineConfirm } from "@/components/camp/sheet";
import { useToast } from "@/components/camp/toast";
import { formatDay, primaryButtonClass } from "@/components/camp/ui";
import { newMedicalCodeAction, turnOffLeaderCodeAction } from "../actions";

/**
 * The medical team's one shared code. It opens a search of everyone's health
 * notes, emergency contact, room and roommates, and nothing else. Shown once.
 */
export function MedicalCode({ codes }: { codes: LeaderCode[] }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useOneAtATime();
  const [shown, setShown] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const code = codes.find((c) => c.scope_kind === "medical");
  const when = (iso: string | null) => (iso ? formatDay(iso) : "never");

  const make = () =>
    start(async () => {
      const r = await newMedicalCodeAction();
      setConfirm(false);
      if (!r.ok) return toast(r.error, { tone: "error" });
      setShown(r.data.code);
      toast("Code made. Copy it now: it won't be shown again.");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      {shown && (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-stone-border bg-white px-4 py-3 text-sm">
          <Check className="h-4 w-4 text-st-paid" strokeWidth={2.4} aria-hidden="true" />
          <span className="flex-1">Medical team: copy this code now. It won&apos;t be shown again.</span>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(shown).then(() => toast("Code copied"))}
            className="cm-press flex h-9 items-center gap-2 rounded-full bg-stone-canvas px-3.5 font-mono text-sm tracking-[0.1em]"
          >
            {shown} <Copy className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
      )}
      {!code ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-stone-border bg-white p-4 text-sm">
          <span className="flex-1 text-warm-gray">No medical team code yet.</span>
          <button type="button" disabled={pending} onClick={make} className={`${primaryButtonClass} h-11 px-5`}>
            Make the code
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-stone-border bg-white px-4 py-3 text-sm">
          <HeartPulse className="h-4 w-4 flex-none" strokeWidth={1.6} aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">Medical team</span>
            <span className="text-xs text-warm-gray">
              Made {when(code.created_at)} · last used {when(code.last_used_at)}
            </span>
          </span>
          {confirm ? (
            <span className="w-full">
              <InlineConfirm
                question="Make a new code for the medical team?"
                detail="The old code stops working at once, and everyone using it is signed out."
                confirmLabel="Yes"
                pending={pending}
                onCancel={() => setConfirm(false)}
                onConfirm={make}
              />
            </span>
          ) : (
            <span className="flex gap-1.5">
              <button type="button" disabled={pending} onClick={() => setConfirm(true)} className="cm-press h-9 rounded-full border border-stone-border bg-white px-3.5 text-[13px] font-medium">
                New code
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await turnOffLeaderCodeAction(code.id);
                    if (!r.ok) return toast(r.error, { tone: "error" });
                    setShown(null);
                    toast("The medical team's code is turned off");
                    router.refresh();
                  })
                }
                className="cm-press h-9 rounded-full px-3 text-[13px] text-warm-gray"
              >
                Turn off
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
