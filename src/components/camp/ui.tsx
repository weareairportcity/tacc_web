import { CircleCheck, CircleDashed, CircleSlash, Clock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Commune, the camp app's look (attendee and admin): stone surfaces, hairline
 * cards, one cyan primary button per screen, Inter Tight headlines. Status is
 * always a sentence with an icon, never a coloured chip. See PRODUCT.md and
 * the design canvas.
 */

export const inputClass =
  "h-12 w-full rounded-[6px] border border-stone-muted bg-white px-3.5 text-base text-ink-black placeholder:text-ash-gray focus:outline-2 focus:outline-offset-1 focus:outline-cyan-signal disabled:bg-stone-canvas disabled:text-warm-gray sm:h-10 sm:text-sm";

/** The one cyan action on a screen. Text stays ink: white on cyan fails contrast. */
export const primaryButtonClass =
  "cm-press inline-flex h-12 items-center justify-center gap-2 rounded-full border border-cyan-edge bg-cyan-signal px-5 text-base font-medium text-ink-black transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";

/** Dark pill for secondary-but-solid actions (e.g. admin toolbars). */
export const buttonClass =
  "cm-press inline-flex h-10 items-center justify-center gap-2 rounded-full bg-soot px-4 text-sm font-medium text-white transition-colors hover:bg-ink-black disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "cm-press inline-flex h-10 items-center justify-center gap-2 rounded-full border border-stone-border bg-white px-4 text-sm font-medium text-ink-black transition-colors hover:bg-stone-canvas disabled:cursor-not-allowed disabled:opacity-50";

export const linkClass = "text-ink-black underline decoration-stone-muted underline-offset-[3px] hover:text-cyan-edge";

export const headlineClass = "font-display text-[40px] font-normal leading-[1.1] tracking-[-0.022em] text-ink-black";
export const titleClass = "font-display text-xl font-normal tracking-[-0.01em] text-ink-black";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-ink-black">{label}</span>
      {children}
      {hint && <span className="text-[13px] leading-snug text-warm-gray">{hint}</span>}
    </label>
  );
}

/** A hairline card. `lifted` gives the one raised element a page is allowed. */
export function Card({
  title,
  action,
  children,
  lifted,
  className,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  lifted?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 bg-white p-5 sm:p-6",
        lifted ? "rounded-2xl shadow-seline-hero" : "rounded-[10px] border border-stone-border shadow-seline-card",
        className,
      )}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          {title && <h2 className={titleClass}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-2 text-sm leading-snug text-ink-black">
      <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5v.5" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/** A plain status sentence: icon (or pulsing dot) then words. Replaces every status chip. */
export function StatusLine({
  icon: Icon,
  dot,
  strong,
  children,
  className,
}: {
  icon?: LucideIcon;
  dot?: "live" | "still";
  strong: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("flex items-center gap-2 text-sm text-warm-gray", className)}>
      {dot && <span className={cn("h-[7px] w-[7px] flex-none rounded-full bg-cyan-signal", dot === "live" && "cm-pulse")} />}
      {Icon && <Icon className="h-4 w-4 flex-none text-ink-black" strokeWidth={1.7} aria-hidden="true" />}
      <span>
        <span className="font-medium text-ink-black">{strong}</span>
        {children && <> · {children}</>}
      </span>
    </p>
  );
}

/** "2027-06-10" → "10 Jun 2027" (dates are stored without a time zone). */
/** "12 Dec": for dates in the camp's own year. */
export function formatDay(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "Fri 18 Dec": when the day of the week helps people plan. */
export function formatWeekday(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const CAMP_STATUS_ICONS: Record<string, LucideIcon> = {
  draft: CircleDashed,
  open: CircleCheck,
  closed: Clock,
  archived: CircleSlash,
};

/** A small filled-circle that shows how much is paid: empty, quarter, half, three quarters, full. */
export function PaidCircle({ paid, price, className }: { paid: number; price: number; className?: string }) {
  const share = price > 0 ? Math.min(1, paid / price) : 1;
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 24 24" className={cn("h-3.5 w-3.5 flex-none -rotate-90", className)} aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="none" stroke="#e8e6e5" strokeWidth="4" />
      {share > 0 && (
        <circle cx="12" cy="12" r={r} fill="none" stroke="#1c1917" strokeWidth="4" strokeDasharray={`${share * c} ${c}`} />
      )}
    </svg>
  );
}

/** Payment status colours (globals.css). Always shown next to words, never alone. */
export const STATUS_COLOR: Record<string, string> = {
  fully_paid: "bg-st-paid",
  partially_paid: "bg-st-part",
  registered: "bg-st-none",
  cancelled: "bg-st-cancel",
};
export const STATUS_WORD: Record<string, string> = {
  fully_paid: "Fully paid",
  partially_paid: "Part paid",
  registered: "Nothing paid",
  cancelled: "Cancelled",
};

/** Registration status as a coloured square and words, for tables and headers. */
export function RegistrationStatus({ status }: { status: string; paid?: number; price?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", status === "cancelled" && "text-warm-gray")}>
      <span className={cn("h-2 w-2 flex-none rounded-[2px]", STATUS_COLOR[status])} aria-hidden="true" />
      {STATUS_WORD[status] ?? status}
    </span>
  );
}

export type BarPart = { key: string; value: number; color: string; label: string };

/** A stacked bar with a 2px gap between parts. The legend beside it carries the numbers. */
export function StackedBar({ parts, className, label }: { parts: BarPart[]; className?: string; label?: string }) {
  const shown = parts.filter((p) => p.value > 0);
  return (
    <span
      role="img"
      aria-label={label ?? parts.map((p) => `${p.value} ${p.label.toLowerCase()}`).join(", ")}
      className={cn("flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full", !shown.length && "bg-stone-border", className)}
    >
      {shown.map((p) => (
        <span key={p.key} className={cn("cm-grow", p.color)} style={{ flex: p.value }} />
      ))}
    </span>
  );
}

export function Legend({ parts, columns, format = (n) => String(n) }: { parts: BarPart[]; columns?: 1 | 2; format?: (n: number) => string }) {
  return (
    <ul className={cn("text-[13px] tabular-nums", columns ? `grid gap-x-3 gap-y-1.5 ${columns === 2 ? "grid-cols-2" : "grid-cols-1"}` : "flex flex-wrap gap-x-4 gap-y-1.5")}>
      {parts.map((p) => (
        <li key={p.key} className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 flex-none rounded-[3px]", p.color, p.color === "bg-stone-border" && "ring-1 ring-inset ring-stone-muted")} aria-hidden="true" />
          {p.label} <strong className="font-semibold">{format(p.value)}</strong>
        </li>
      ))}
    </ul>
  );
}

/** Fully paid, part paid, nothing paid (and cancelled) as bar parts. */
export function statusParts(counts: Partial<Record<string, number>>, withCancelled = true): BarPart[] {
  return (["fully_paid", "partially_paid", "registered", ...(withCancelled ? ["cancelled"] : [])] as const).map((k) => ({
    key: k,
    value: counts[k] ?? 0,
    color: STATUS_COLOR[k],
    label: STATUS_WORD[k],
  }));
}
