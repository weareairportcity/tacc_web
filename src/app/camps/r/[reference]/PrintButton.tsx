"use client";

import { Printer } from "lucide-react";
import { secondaryButtonClass } from "@/components/camp/ui";

/** Print, or "Save as PDF" in the print dialog. Hidden on the printout itself. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={`${secondaryButtonClass} h-12 w-full gap-2 print:hidden`}>
      <Printer className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Print or save as PDF
    </button>
  );
}
