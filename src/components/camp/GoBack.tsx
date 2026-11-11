"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * "Back" for pages anyone can land on from anywhere (legal pages, receipts):
 * returns to the page they came from, or `fallback` when they opened it
 * directly (from a text message, say).
 */
export function GoBack({ fallback = "/camps", label = "Back" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return (
    <a
      href={fallback}
      onClick={(e) => {
        // Came from a Commune page: go back to it, scroll position and all.
        if (window.history.length > 1 && document.referrer.startsWith(location.origin)) {
          e.preventDefault();
          router.back();
        }
      }}
      className="cm-press -ml-1 inline-flex min-h-11 items-center gap-2 self-start text-[15px] text-ink-black print:hidden"
    >
      <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" />
      {label}
    </a>
  );
}
