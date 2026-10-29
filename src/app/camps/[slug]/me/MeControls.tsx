"use client";

import { Busy } from "@/components/camp/brand";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Share2, Smartphone, X } from "lucide-react";
import { ErrorText, secondaryButtonClass } from "@/components/camp/ui";
import { forgetJoinAction, myPayLinkAction, withdrawRequestAction } from "../actions";

/** A link a parent or sponsor can open to pay without signing in. Shares on phones, copies elsewhere. */
export function SharePayLink({ slug }: { slug: string }) {
  const [state, setState] = useState<"" | "copied" | "error">("");
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await myPayLinkAction(slug);
          if (!r.ok) return setState("error");
          // Just the link: the pay page says who it's for and how much.
          if (navigator.share) {
            await navigator.share({ url: r.data }).catch(() => null);
            return;
          }
          await navigator.clipboard?.writeText(r.data).catch(() => null);
          setState("copied");
          setTimeout(() => setState(""), 2000);
        })
      }
      className={`${secondaryButtonClass} h-12 w-full`}
      aria-live="polite"
    >
      <Share2 className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
      {state === "copied" ? "Link copied" : state === "error" ? "Try again" : "Share a pay link"}
    </button>
  );
}

export function WithdrawRequest({ slug, requestId }: { slug: string; requestId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await withdrawRequestAction(slug, requestId);
            if (!r.ok) return setError(r.error);
            router.refresh();
          })
        }
        className="min-h-10 px-1 text-[13px] text-warm-gray underline underline-offset-[3px]"
      >
        <Busy pending={pending} text="Withdrawing…">Withdraw</Busy>
      </button>
      <ErrorText>{error}</ErrorText>
    </span>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Add Commune to your home screen", when the browser offers it and it isn't already installed. */
export function InstallHint() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("commune.install") === "no";
    } catch {}
    if (dismissed || window.matchMedia("(display-mode: standalone)").matches) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (hidden || !event) return null;
  return (
    <section className="cm-rise flex items-center gap-3 rounded-[10px] bg-cyan-tint px-4 py-3">
      <Smartphone className="h-5 w-5 flex-none text-cyan-deep" strokeWidth={1.6} aria-hidden="true" />
      <span className="flex-1 text-sm">Add Commune to your home screen</span>
      <button
        type="button"
        onClick={async () => {
          await event.prompt();
          setHidden(true);
        }}
        className={`${secondaryButtonClass} h-9 px-3.5 text-[13px]`}
      >
        Add
      </button>
      <button
        type="button"
        aria-label="Not now"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem("commune.install", "no");
          } catch {}
        }}
        className="flex h-9 w-9 items-center justify-center text-warm-gray"
      >
        <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
      </button>
    </section>
  );
}

/** "No thanks" to a remembered friend's link. */
export function ForgetJoin({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await forgetJoinAction(slug);
          router.refresh();
        })
      }
      className={`${secondaryButtonClass} h-11 w-full`}
    >
      <Busy pending={pending} text="One moment…">No thanks</Busy>
    </button>
  );
}
