"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export const INBOX_READ = "commune:inbox-read";

/** The way to the Notifications page, with how many are new. Clears when that page is opened. */
export function InboxBell({ href, unread, className }: { href: string; unread: number; className?: string }) {
  // The count the page last cleared; a newer count from the server shows again.
  const [cleared, setCleared] = useState<number | null>(null);
  const n = cleared === unread ? 0 : unread;
  useEffect(() => {
    const clear = () => setCleared(unread);
    window.addEventListener(INBOX_READ, clear);
    return () => window.removeEventListener(INBOX_READ, clear);
  }, [unread]);
  return (
    <Link
      href={href}
      aria-label={n ? `Notifications, ${n} new` : "Notifications"}
      className={cn("cm-press relative flex h-10 w-10 flex-none items-center justify-center rounded-full border border-stone-border bg-white", className)}
    >
      <Bell className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
      {n > 0 && (
        <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-cyan-signal px-1 text-[11px] font-semibold text-ink-black">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
