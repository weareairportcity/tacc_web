"use client";

import { useTransition } from "react";
import { signOutAction } from "@/app/admin/camp/session";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => signOutAction())}
      className={cn("text-warm-gray underline decoration-stone-muted underline-offset-[3px] hover:text-ink-black disabled:opacity-60", className)}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
