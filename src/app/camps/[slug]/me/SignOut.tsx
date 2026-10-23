"use client";

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
      className={secondaryButtonClass}
    >
      Sign out
    </button>
  );
}
