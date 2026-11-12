"use client";

import { useState } from "react";
import { Check, Download, Share2 } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import type { ReceiptView } from "@/components/camp/ReceiptCard";
import { primaryButtonClass, secondaryButtonClass } from "@/components/camp/ui";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { downloadReceiptsPdf } from "@/lib/camp/receipt-pdf";

/** Download as a PDF file, and Share (the phone's share sheet, or copy the link). */
export function ReceiptActions({ receipt, camp, title }: { receipt: ReceiptView; camp: { name: string; starts_on: string }; title: string }) {
  const [copied, setCopied] = useState(false);
  const [pending, start] = useOneAtATime();
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
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() => start(() => downloadReceiptsPdf([receipt], camp, `receipt-${receipt.reference}.pdf`))}
        className={`${primaryButtonClass} h-12 gap-2`}
      >
        <Busy pending={pending} text="Making the PDF…">
          <Download className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> Download PDF
        </Busy>
      </button>
      <button type="button" onClick={share} className={`${secondaryButtonClass} h-12 gap-2`} aria-live="polite">
        {copied ? <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> : <Share2 className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />}
        {copied ? "Link copied" : "Share"}
      </button>
    </div>
  );
}
