"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { IPAD_COOKIE } from "@/lib/camp/ipad";

/**
 * On an iPad (a "Mac" with a touchscreen), tells the server once with a
 * cookie, then reloads the page so the Home Screen app step shows as it
 * does on a phone. Renders nothing.
 */
export function IPadMark() {
  const router = useRouter();
  useEffect(() => {
    const ipad = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    const marked = document.cookie.split("; ").includes(`${IPAD_COOKIE}=1`);
    if (!ipad || marked) return;
    document.cookie = `${IPAD_COOKIE}=1; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    router.refresh();
  }, [router]);
  return null;
}
