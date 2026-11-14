import { cn } from "@/lib/utils";

/**
 * One dot per bed (blue taken, green arrived, empty free), with the number
 * always written beside them: "2 / 4 · 2 free", never dots or colour alone.
 */
export function Beds({ capacity, taken, arrived = 0 }: { capacity: number; taken: number; arrived?: number }) {
  const free = Math.max(0, capacity - taken);
  return (
    <span className="flex items-center gap-2" role="img" aria-label={`${taken} of ${capacity} beds taken, ${free} free${arrived ? `, ${arrived} arrived` : ""}`}>
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: Math.min(capacity, 10) }, (_, i) => (
          <span
            key={i}
            className={cn("h-[11px] w-[11px] rounded-full", i < arrived ? "bg-st-paid" : i < taken ? "bg-cyan-edge" : "border-[1.5px] border-stone-muted")}
          />
        ))}
      </span>
      <span className="text-[13px] whitespace-nowrap tabular-nums" aria-hidden="true">
        <span className="font-medium">
          {taken} / {capacity}
        </span>
        <span className="text-warm-gray"> · {free ? `${free} free` : "full"}</span>
      </span>
    </span>
  );
}

/** An occupant's name with a green dot once they've checked in. */
export function Arrived({ on }: { on: boolean }) {
  return on ? <span className="h-2 w-2 flex-none rounded-full bg-st-paid" role="img" aria-label="Arrived" /> : null;
}

/**
 * A room's beds as one row of segments, full width so the room name never
 * has to share its line: blue taken, green arrived, grey free.
 */
export function BedBar({ capacity, taken, arrived = 0, className }: { capacity: number; taken: number; arrived?: number; className?: string }) {
  const free = Math.max(0, capacity - taken);
  return (
    <span
      role="img"
      aria-label={`${taken} of ${capacity} beds taken, ${free} free${arrived ? `, ${arrived} arrived` : ""}`}
      className={cn("flex h-1.5 w-full gap-[3px]", className)}
    >
      {Array.from({ length: capacity }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn("min-w-0 flex-1 rounded-full transition-colors duration-300", i < arrived ? "bg-st-paid" : i < taken ? "bg-[#3398e1]" : "bg-stone-border")}
        />
      ))}
    </span>
  );
}
