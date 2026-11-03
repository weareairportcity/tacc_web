"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { buttonClass } from "./ui";

const KEY = "cm_cookies_seen";

/**
 * Says what Commune keeps on the phone, once. Commune only uses the cookies it needs to keep
 * someone signed in, and counts visits without knowing who made them, so this is a notice
 * with an OK, not a "do you agree" choice. Hidden until the page has loaded, so it never
 * pushes anything around on the first paint.
 */
const listeners = new Set<() => void>();
const subscribe = (on: () => void) => {
  listeners.add(on);
  return () => listeners.delete(on);
};
const unseen = () => {
  try {
    return localStorage.getItem(KEY) !== "1";
  } catch {
    return true;
  }
};

export function CookieNotice({ raised = false }: { raised?: boolean }) {
  // Hidden on the server and the first paint, then shown if this phone hasn't said OK.
  const show = useSyncExternalStore(subscribe, unseen, () => false);
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Shown again next time; nothing else depends on it.
    }
    listeners.forEach((l) => l());
  };
  return (
    <div
      role="region"
      aria-label="Cookies"
      className={`cm-cookie-notice cm-rise fixed inset-x-3 z-40 mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-stone-border bg-white p-4 shadow-[0_16px_40px_rgba(17,12,46,0.14)] ${
        raised ? "bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:bottom-4" : "bottom-[calc(env(safe-area-inset-bottom)+1rem)]"
      }`}
    >
      <p className="min-w-[200px] flex-1 text-[14px] leading-relaxed text-ink-black">
        Commune only uses the cookies it needs to keep you signed in. It counts visits to make the app better, without knowing who you are.{" "}
        <Link href="/camps/privacy" className="underline decoration-stone-muted underline-offset-[3px]">
          Privacy
        </Link>
      </p>
      <button type="button" onClick={close} className={`${buttonClass} h-11 px-5`}>
        OK
      </button>
    </div>
  );
}
