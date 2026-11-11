"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bell, Check, EllipsisVertical, Share, Smartphone, X } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { ErrorText, primaryButtonClass } from "@/components/camp/ui";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { cn } from "@/lib/utils";
import { usePush, type PushActions } from "./usePush";

const DISMISSED = "commune.prompt.dismissed";

const WHY = {
  attendee: "Hear when your payment arrives (with your receipt), when your room is ready, and before payment is due.",
  staff: "Hear about new registrations, payments and requests as they happen.",
};

/**
 * "Add Commune to your Home Screen, then turn on notifications." Shows on
 * every visit until both are done (or for this visit after "Not now"). On a
 * computer only the notifications step applies.
 */
export function NotifyPrompt({ who, actions }: { who: "attendee" | "staff"; actions: PushActions }) {
  const push = usePush(actions);
  const [dismissed, setDismissed] = useState(true);
  const [pending, start] = useOneAtATime();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      // Read once, after the first render: browser storage only.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(sessionStorage.getItem(DISMISSED) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const mobile = push.platform !== "desktop";
  const installDone = !mobile || push.installed;
  // Nothing more to ask: on, blocked (only the phone's settings can undo that), or not possible here.
  const notifyDone = push.on || push.permission === "denied" || (!push.supported && !push.needsInstallFirst);
  const show = push.ready && !dismissed && !(installDone && notifyDone);

  useEffect(() => {
    if (show) dialog.current?.focus();
  }, [show]);

  if (!show) return null;

  const close = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED, "1");
    } catch {}
  };

  // The one thing to do now.
  const step: "install" | "notify" = installDone ? "notify" : "install";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-black/35 p-3 sm:items-center" onKeyDown={(e) => e.key === "Escape" && close()}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="cm-rise flex w-full max-w-[420px] flex-col gap-5 rounded-[22px] bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-[0_24px_60px_rgba(17,12,46,0.22)] outline-none sm:pb-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-cyan-tint">
            <Bell className="h-5 w-5 text-cyan-deep" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div className="flex flex-1 flex-col gap-1">
            <h2 id={titleId} className="text-[19px] font-medium leading-tight">
              {mobile ? "Get Commune on your phone" : "Turn on notifications"}
            </h2>
            <p className="text-[14px] leading-snug text-warm-gray">{WHY[who]}</p>
          </div>
          <button type="button" onClick={close} aria-label="Not now" className="cm-press -mr-1.5 -mt-1.5 flex h-10 w-10 flex-none items-center justify-center rounded-full text-warm-gray">
            <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <ol className="flex flex-col gap-2">
          {mobile && (
            <Step n={1} done={installDone} current={step === "install"} title="Add to Home Screen">
              {push.platform === "ios" ? (
                <>
                  Tap <Share className="inline h-4 w-4 align-[-3px]" strokeWidth={1.8} aria-label="Share" /> at the bottom of Safari, then <strong className="font-medium">Add to Home Screen</strong>. Open Commune from your Home Screen to finish.
                </>
              ) : push.installable ? (
                "One tap, and Commune opens like an app."
              ) : (
                <>
                  Open the browser menu <EllipsisVertical className="inline h-4 w-4 align-[-3px]" strokeWidth={1.8} aria-label="menu" /> and tap <strong className="font-medium">Add to Home screen</strong> or <strong className="font-medium">Install app</strong>.
                </>
              )}
            </Step>
          )}
          <Step n={mobile ? 2 : 1} done={push.on} current={step === "notify"} title="Turn on notifications">
            {push.permission === "denied"
              ? "Notifications are blocked. Allow them for Commune in your phone's settings."
              : push.needsInstallFirst
                ? "After you add Commune to your Home Screen."
                : "You choose which ones in your profile."}
          </Step>
        </ol>

        <ErrorText>{push.error}</ErrorText>

        <div className="flex flex-col gap-2">
          {step === "install" && push.platform !== "ios" && push.installable && (
            <button type="button" disabled={pending} onClick={() => start(push.install)} className={`${primaryButtonClass} h-12 w-full gap-2`}>
              <Smartphone className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Add to Home Screen
            </button>
          )}
          {step === "notify" && !push.on && push.supported && push.permission !== "denied" && !push.needsInstallFirst && (
            <button type="button" disabled={pending} aria-busy={pending} onClick={() => start(push.enable)} className={`${primaryButtonClass} h-12 w-full gap-2`}>
              <Busy pending={pending} text="Turning on…">
                <Bell className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Turn on notifications
              </Busy>
            </button>
          )}
          {/* On Android, notifications work before installing too. */}
          {step === "install" && push.platform === "android" && !push.on && push.supported && push.permission === "default" && (
            <button type="button" disabled={pending} onClick={() => start(push.enable)} className="cm-press h-11 rounded-full text-[14px] font-medium underline underline-offset-[3px]">
              Turn on notifications first
            </button>
          )}
          <button type="button" onClick={close} className="cm-press h-11 rounded-full text-[14px] text-warm-gray">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, done, current, title, children }: { n: number; done: boolean; current: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className={cn("flex gap-3 rounded-[14px] border px-3.5 py-3", current ? "border-cyan-edge bg-cyan-tint/40" : "border-stone-border")}>
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-[13px] font-medium",
          done ? "bg-st-paid text-white" : current ? "bg-soot text-white" : "bg-stone-canvas text-warm-gray",
        )}
        aria-hidden="true"
      >
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.4} /> : n}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className={cn("text-[15px] font-medium", done && "text-warm-gray line-through decoration-stone-muted")}>
          {title}
          <span className="sr-only">{done ? ", done" : current ? ", to do now" : ""}</span>
        </span>
        {!done && <span className="text-[13px] leading-snug text-warm-gray">{children}</span>}
      </span>
    </li>
  );
}
