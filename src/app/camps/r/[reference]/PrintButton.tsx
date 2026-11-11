"use client";

import { useState } from "react";
import { Check, Download, Share2 } from "lucide-react";
import { primaryButtonClass, secondaryButtonClass } from "@/components/camp/ui";

/**
 * Save as PDF (the print dialog's "Save as PDF", which prints the receipt
 * alone) and Share (the phone's share sheet, or copy the link).
 */
export function ReceiptActions({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = location.href;
    try {
      if (navigator.share) return await navigator.share({ title, url });
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Closing the share sheet isn't an error.
    }
  };
  return (
    <div className="grid grid-cols-2 gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className={`${primaryButtonClass} h-12 gap-2`}>
        <Download className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Save as PDF
      </button>
      <button type="button" onClick={share} className={`${secondaryButtonClass} h-12 gap-2`} aria-live="polite">
        {copied ? <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> : <Share2 className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />}
        {copied ? "Link copied" : "Share"}
      </button>
    </div>
  );
}
