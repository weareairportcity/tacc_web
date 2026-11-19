"use client";

import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { Busy } from "@/components/camp/brand";
import { leaderSignOutAction, signOutAction } from "@/app/admin/camp/session";
import { cn } from "@/lib/utils";
import { currentSubscription } from "./notifications/push-client";

/** Signs out of this side only: a leader button ends the leader code, a coordinator one the email sign-in. */
export function SignOutButton({ className, leader = false, label = "Sign out" }: { className?: string; leader?: boolean; label?: string }) {
  const [pending, start] = useOneAtATime();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (!leader) return signOutAction();
          // This phone stops getting that code's notifications.
          const sub = await currentSubscription().catch(() => null);
          return leaderSignOutAction(sub?.endpoint);
        })
      }
      className={cn("text-warm-gray underline decoration-stone-muted underline-offset-[3px] hover:text-ink-black disabled:opacity-60", className)}
    >
      <Busy pending={pending} text="Signing out…">{label}</Busy>
    </button>
  );
}
