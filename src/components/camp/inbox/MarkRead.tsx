"use client";

import { useEffect } from "react";
import { INBOX_READ } from "./InboxBell";

/** Once the page is shown, its notifications count as read and the bell clears (the dots stay for this visit). */
export function MarkRead({ action, unread }: { action: () => Promise<unknown>; unread: number }) {
  useEffect(() => {
    if (!unread) return;
    action().then(
      () => window.dispatchEvent(new Event(INBOX_READ)),
      () => {},
    );
  }, [action, unread]);
  return null;
}
