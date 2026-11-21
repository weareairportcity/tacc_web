"use client";

import { FileDown } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { useToast } from "@/components/camp/toast";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { secondaryButtonClass } from "@/components/camp/ui";

async function save(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.text()) || "Couldn't create the summary.");
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "camp-summary";
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}

/** Downloads the PDF, then the spreadsheet. Each file is logged. */
export function SummaryButton({ campId }: { campId: string }) {
  const toast = useToast();
  const [pending, start] = useOneAtATime();
  const base = `/admin/camp/${campId}/summary`;

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      className={`${secondaryButtonClass} h-10 flex-none`}
      onClick={() =>
        start(async () => {
          try {
            await save(`${base}/pdf`);
            await new Promise((r) => setTimeout(r, 400));
            await save(`${base}/csv`);
          } catch (err) {
            toast(err instanceof Error ? err.message : "Couldn't create the summary.", { tone: "error" });
          }
        })
      }
    >
      <Busy pending={pending} text="Creating summary…">
        <FileDown className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
        Create summary
      </Busy>
    </button>
  );
}
