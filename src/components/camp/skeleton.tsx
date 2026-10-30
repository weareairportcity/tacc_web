import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The shape of the next page while it loads, with its real title, so a tap changes the
 * screen at once (no "did it work?" second tap) and shows where you're going.
 */

const Bar = ({ className }: { className?: string }) => <span aria-hidden="true" className={cn("cm-skel block", className)} />;

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-label={`Loading ${label}`} className="flex flex-col gap-6 pt-2">
      {children}
    </div>
  );
}

/** An attendee page: Back to home, the title, a line of text, then the page's blocks. */
export function AttendeeSkeleton({ title, kind = "cards", back = true }: { title: string; kind?: "home" | "cards" | "form"; back?: boolean }) {
  return (
    <Shell label={title}>
      <div className="flex flex-col gap-2.5">
        {back && (
          <span className="-ml-1 inline-flex min-h-11 items-center gap-2 self-start text-[15px] text-warm-gray">
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" />
            Back to home
          </span>
        )}
        <h1 className="font-display text-[36px] leading-[1.12] tracking-[-0.022em] text-ink-black">{title}</h1>
        <Bar className="h-4 w-3/4" />
      </div>
      {kind === "home" && (
        <>
          <div className="flex flex-col gap-4 rounded-2xl border border-stone-border bg-white p-5">
            <Bar className="h-3.5 w-24" />
            <Bar className="h-10 w-40" />
            <Bar className="h-2 w-full rounded-full" />
            <Bar className="h-12 w-full rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="flex min-h-[124px] flex-col justify-between rounded-[14px] border border-stone-border bg-white p-4">
                <Bar className="h-10 w-10 rounded-full" />
                <Bar className="h-4 w-2/3" />
              </span>
            ))}
          </div>
        </>
      )}
      {kind === "cards" &&
        [0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-2xl border border-stone-border bg-white p-5">
            <Bar className="h-5 w-1/2" />
            <Bar className="h-4 w-full" />
            <Bar className="h-12 w-full rounded-full" />
          </div>
        ))}
      {kind === "form" && (
        <div className="flex flex-col gap-5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex flex-col gap-2">
              <Bar className="h-4 w-28" />
              <Bar className="h-[52px] w-full rounded-[10px]" />
            </span>
          ))}
          <Bar className="h-[52px] w-full rounded-full" />
        </div>
      )}
    </Shell>
  );
}

/** A coordinator or leader page: the title, a row of controls, then rows or a board. */
export function StaffSkeleton({ title, kind = "list" }: { title: string; kind?: "list" | "board" | "form" | "today" }) {
  return (
    <Shell label={title}>
      <h1 className="font-display text-[34px] leading-[1.1] tracking-[-0.022em] text-ink-black">{title}</h1>
      {kind === "today" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex flex-col gap-3 rounded-[14px] border border-stone-border bg-white p-4">
              <Bar className="h-4 w-1/2" />
              <Bar className="h-8 w-20" />
            </span>
          ))}
        </div>
      )}
      {kind !== "form" && (
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <Bar key={i} className="h-10 w-24 rounded-full" />
          ))}
        </div>
      )}
      {kind === "board" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="flex flex-col gap-2.5 rounded-[14px] border border-stone-border bg-white p-4">
              <Bar className="h-5 w-16" />
              <Bar className="h-9 w-full" />
              <Bar className="h-9 w-full" />
            </span>
          ))}
        </div>
      ) : kind === "form" ? (
        <div className="flex max-w-xl flex-col gap-5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex flex-col gap-2">
              <Bar className="h-4 w-32" />
              <Bar className="h-11 w-full rounded-[10px]" />
            </span>
          ))}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-[12px] border border-stone-border bg-white">
          {Array.from({ length: 7 }, (_, i) => (
            <li key={i} className="flex min-h-14 items-center gap-3 border-t border-stone-border px-4 first:border-t-0">
              <span className="flex flex-1 flex-col gap-1.5">
                <Bar className="h-4 w-1/3" />
                <Bar className="h-3 w-1/4" />
              </span>
              <Bar className="h-4 w-16" />
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
