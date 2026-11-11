"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { ErrorText, secondaryButtonClass } from "@/components/camp/ui";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { usePush, type PushActions } from "./usePush";

export const ATTENDEE_KINDS = [
  { kind: "payment_received", label: "Payments and receipts", hint: "When your payment arrives" },
  { kind: "payment_failed", label: "A payment that didn't go through", hint: "So you can try again" },
  { kind: "room_ready", label: "Your room", hint: "When your room is ready" },
  { kind: "request_answered", label: "Answers to your requests", hint: "Refunds and room changes" },
  { kind: "due_soon", label: "Payment reminder", hint: "3 days before payment is due" },
  { kind: "camp_tomorrow", label: "Day before camp", hint: "A reminder to bring your pass" },
];

export const STAFF_KINDS = [
  { kind: "registration", label: "New registrations", hint: "Each person who registers" },
  { kind: "payment", label: "Payments received", hint: "Each payment, with what's left" },
  { kind: "payment_problem", label: "Payments that need a look", hint: "Wrong amount, or paid twice" },
  { kind: "request", label: "New requests", hint: "Refunds and room changes" },
];

/**
 * App notifications for this phone, and which kinds this person gets (on
 * all their phones). Each switch saves as it's flipped.
 */
export function NotifySettings({ actions, kinds }: { actions: PushActions; kinds: { kind: string; label: string; hint: string }[] }) {
  const push = usePush(actions);
  const [off, setOff] = useState<string[] | null>(null);
  const [saveError, setSaveError] = useState("");
  const [pending, start] = useOneAtATime();

  useEffect(() => {
    let live = true;
    void actions.prefs().then((r) => live && r.ok && setOff(r.data.off));
    return () => {
      live = false;
    };
  }, [actions]);

  const flip = async (kind: string, on: boolean) => {
    if (!off) return;
    const next = on ? off.filter((k) => k !== kind) : [...off, kind];
    setOff(next);
    setSaveError("");
    const r = await actions.prefs(next);
    if (!r.ok) {
      setOff(off);
      setSaveError(r.error);
    }
  };

  const status = !push.ready
    ? ""
    : push.on
      ? "On for this phone."
      : push.permission === "denied"
        ? "Blocked on this phone. Allow notifications for Commune in your phone's settings."
        : push.needsInstallFirst
          ? "On iPhone, add Commune to your Home Screen first (Share, then Add to Home Screen), then open it from there."
          : !push.supported
            ? "This browser can't show notifications."
            : "Off for this phone.";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {push.on ? <Bell className="h-5 w-5 flex-none text-st-paid" strokeWidth={1.7} aria-hidden="true" /> : <BellOff className="h-5 w-5 flex-none text-warm-gray" strokeWidth={1.7} aria-hidden="true" />}
        <p className="min-w-[180px] flex-1 text-[15px]" aria-live="polite">
          {status}
        </p>
        {push.ready && push.supported && push.permission !== "denied" && !push.needsInstallFirst && (
          <button type="button" disabled={pending} aria-busy={pending} onClick={() => start(push.on ? push.disable : push.enable)} className={`${secondaryButtonClass} h-10 px-4 text-sm`}>
            <Busy pending={pending} text={push.on ? "Turning off…" : "Turning on…"}>
              {push.on ? "Turn off" : "Turn on"}
            </Busy>
          </button>
        )}
      </div>
      <ErrorText>{push.error}</ErrorText>

      <fieldset className="flex flex-col" disabled={!off}>
        <legend className="mb-1 text-sm font-medium">What to notify me about</legend>
        {kinds.map((k) => {
          const on = !off?.includes(k.kind);
          return (
            <label key={k.kind} className="flex min-h-14 cursor-pointer items-center gap-3 border-t border-stone-border py-2 first-of-type:border-t-0">
              <span className="flex flex-1 flex-col">
                <span className="text-[15px]">{k.label}</span>
                <span className="text-[13px] text-warm-gray">{k.hint}</span>
              </span>
              <input type="checkbox" role="switch" checked={on} onChange={(e) => void flip(k.kind, e.target.checked)} className="peer sr-only" />
              <span
                aria-hidden="true"
                className="relative h-7 w-12 flex-none rounded-full bg-stone-border transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200 peer-checked:bg-soot peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-signal motion-reduce:transition-none motion-reduce:after:transition-none"
              />
            </label>
          );
        })}
      </fieldset>
      <ErrorText>{saveError}</ErrorText>
    </div>
  );
}
