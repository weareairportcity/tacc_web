"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="cm-press inline-flex h-11 items-center gap-2 rounded-full border border-stone-border bg-white px-4 text-sm font-medium print:hidden">
      <Printer className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Print
    </button>
  );
}
