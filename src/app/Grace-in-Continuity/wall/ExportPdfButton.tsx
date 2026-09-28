"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import type { BookNote } from "./pdf";

/** Builds the birthday book in the browser and downloads it. */
export function ExportPdfButton({ notes }: { notes: BookNote[] }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportPdf() {
    setError(null);
    setProgress(0);
    try {
      const { buildBirthdayBook } = await import("./pdf");
      const blob = await buildBirthdayBook(notes, setProgress);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Happy Birthday Pastor - Grace in Continuity.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      console.error(err);
      setError("We could not make the PDF. Please check your internet and try again.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={exportPdf}
        disabled={progress !== null}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#2b2724] px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
      >
        <FileDown className="h-4 w-4" />
        {progress === null ? "Export PDF" : `Making PDF… ${Math.round(progress * 100)}%`}
      </button>
      {error && <span className="max-w-60 text-right text-xs text-[#b4562e]">{error}</span>}
    </span>
  );
}
