"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { leaderSwitchAction } from "@/app/admin/camp/session";
import { Busy } from "./brand";
import { useOneAtATime } from "./useOneAtATime";

/** One of the other codes on this phone: tap to use it. */
export function SwitchAccount({ id, name }: { id: string; name: string }) {
  const [pending, start] = useOneAtATime();
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await leaderSwitchAction(id);
            if (r && !r.ok) setError(r.error);
          })
        }
        className="cm-hover -mx-1 flex min-h-11 items-center gap-2.5 rounded-[8px] px-2 text-left text-sm disabled:opacity-60"
      >
        <ArrowLeftRight className="h-4 w-4 flex-none text-warm-gray" strokeWidth={1.7} aria-hidden="true" />
        <Busy pending={pending} text="Switching…">
          <span className="truncate">{name}</span>
        </Busy>
      </button>
      {error && <p className="px-1 text-xs text-warm-gray">{error}</p>}
    </>
  );
}
