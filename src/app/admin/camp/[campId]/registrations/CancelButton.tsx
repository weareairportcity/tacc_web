"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelRegistrationAction } from "../../actions";

/**
 * Two clicks to cancel, like deleting a room. Refunds are done in Paystack.
 * Stays mounted once cancelled so a locked-group warning survives the refresh.
 */
export function CancelButton({ id, name, cancelled }: { id: string; name: string; cancelled: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [pending, startTransition] = useTransition();

  if (cancelled) return warning ? <span className="block max-w-56 text-left text-xs text-ink-black">{warning}</span> : null;

  const click = () => {
    if (!confirming) return setConfirming(true);
    setConfirming(false);
    startTransition(async () => {
      const result = await cancelRegistrationAction(id);
      if (!result.ok) return setError(result.error);
      if (result.data) setWarning(result.data);
      router.refresh();
    });
  };

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={click}
        onBlur={() => setConfirming(false)}
        aria-label={`Cancel ${name}'s registration`}
        className={
          confirming
            ? "rounded-md bg-ink-black px-2 py-1 text-xs font-medium text-white"
            : "rounded-md px-2 py-1 text-xs text-warm-gray hover:bg-stone-canvas hover:text-ink-black"
        }
      >
        {confirming ? "Cancel registration?" : "Cancel"}
      </button>
      {error && <span className="text-xs text-ink-black">{error}</span>}
    </span>
  );
}
