"use client";

import { Busy } from "@/components/camp/brand";
import { useTransition } from "react";
import { leaderSignOutAction, signOutAction } from "@/app/admin/camp/session";
import { cn } from "@/lib/utils";

/** Signs out of this side only: a leader button ends the leader code, a coordinator one the email sign-in. */
export function SignOutButton({ className, leader = false }: { className?: string; leader?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => (leader ? leaderSignOutAction() : signOutAction()))}
      className={cn("text-warm-gray underline decoration-stone-muted underline-offset-[3px] hover:text-ink-black disabled:opacity-60", className)}
    >
      <Busy pending={pending} text="Signing out…">Sign out</Busy>
    </button>
  );
}
