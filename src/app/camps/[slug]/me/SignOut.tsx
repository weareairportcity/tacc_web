"use client";
import { Busy } from "@/components/camp/brand";

import { useTransition } from "react";
import { signOutAction } from "../actions";
import { secondaryButtonClass } from "@/components/camp/ui";

export function SignOut() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => signOutAction())}
      aria-busy={pending}
      className={`${secondaryButtonClass} h-9 flex-none px-3.5 text-[13px]`}
    >
      <Busy pending={pending} text="Signing out…" size={18}>Sign out</Busy>
    </button>
  );
}
