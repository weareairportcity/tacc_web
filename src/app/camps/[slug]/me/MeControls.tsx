"use client";

import { Busy } from "@/components/camp/brand";
import { useState } from "react";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { Share2 } from "lucide-react";
import { ErrorText, secondaryButtonClass } from "@/components/camp/ui";
import { forgetJoinAction, myPayLinkAction, withdrawRequestAction } from "../actions";

/** A link a parent or sponsor can open to pay without signing in. Shares on phones, copies elsewhere. */
export function SharePayLink({ slug }: { slug: string }) {
  const [state, setState] = useState<"" | "copied" | "error">("");
  const [pending, start] = useOneAtATime();
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
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await withdrawRequestAction(slug, requestId);
            if (!r.ok) return setError(r.error);
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

export function ForgetJoin({ slug }: { slug: string }) {
  const [pending, start] = useOneAtATime();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await forgetJoinAction(slug);
        })
      }
      className={`${secondaryButtonClass} h-11 w-full`}
    >
      <Busy pending={pending} text="One moment…">No thanks</Busy>
    </button>
  );
}
