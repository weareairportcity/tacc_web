"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { staffSeenAction } from "@/app/admin/camp/session";
import { attendeeSeenAction } from "@/app/camps/[slug]/actions";

/**
 * "Who's online" and "came today". Coordinators and leaders: every 10 minutes while the tab
 * is showing, so the admin's Online page is never more than a few minutes old. Attendees:
 * once a day per phone, for active users and retention.
 */

const EVERY_MS = 10 * 60_000;
const DAY_KEY = "cm_seen_day";
const campIn = (pathname: string) => pathname.match(/^\/(?:admin\/camp|leaders)\/([0-9a-f-]{36})/i)?.[1] ?? null;

export function Seen({ staff }: { staff: boolean }) {
  const pathname = usePathname();
  const camp = staff ? campIn(pathname) : null;

  useEffect(() => {
    if (!staff) {
      const today = new Date().toISOString().slice(0, 10);
      try {
        if (localStorage.getItem(DAY_KEY) === today) return;
      } catch {
        // No storage (private window): ask anyway, it's once per page load.
      }
      void attendeeSeenAction()
        .then((signedIn) => {
          try {
            if (signedIn) localStorage.setItem(DAY_KEY, today);
          } catch {
            // Asked again on the next page load.
          }
        })
        .catch(() => {});
      return;
    }
    if (pathname.endsWith("/sign-in") || pathname === "/leaders") return;
    let last = 0;
    const ping = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < EVERY_MS - 5000) return;
      last = Date.now();
      void staffSeenAction(camp).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, EVERY_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
    // A new camp is worth one ping; a new screen in the same camp isn't.
  }, [staff, camp, pathname.endsWith("/sign-in")]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
