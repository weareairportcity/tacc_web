import Link from "next/link";
import { ArrowLeft, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The attendee subpages, for people who aren't comfortable with apps: "Back
 * to home" top left, one plain sentence on what the page is for, big numbered
 * choice cards that each carry their own button, and notes in sentences.
 */

export function BackHome({ slug }: { slug: string }) {
  return (
    <Link href={`/camps/${slug}/me`} className="cm-press -ml-1 inline-flex min-h-11 items-center gap-2 self-start text-[15px] text-ink-black">
      <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" />
      Back to home
    </Link>
  );
}

export function Intro({ slug, title, children }: { slug: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <BackHome slug={slug} />
      <h1 className="cm-rise font-display text-[36px] leading-[1.12] tracking-[-0.022em]">{title}</h1>
      <p className="text-base leading-relaxed text-warm-gray">{children}</p>
    </div>
  );
}

/** A big numbered option: what it is in words, then its own button. `primary` marks the suggested one. */
export function Choice({
  num,
  title,
  sub,
  primary,
  delay = 60,
  children,
}: {
  num: number;
  title: string;
  sub: React.ReactNode;
  primary?: boolean;
  delay?: number;
  children?: React.ReactNode;
}) {
  const id = `choice-${num}`;
  return (
    <section
      aria-labelledby={id}
      className={cn("cm-rise flex flex-col gap-3 rounded-2xl bg-white p-[18px] shadow-seline-card", primary ? "border-[1.5px] border-cyan-edge" : "border border-stone-border")}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="flex items-start gap-3">
        <span aria-hidden="true" className={cn("flex h-8 w-8 flex-none items-center justify-center rounded-full text-[15px] font-semibold", primary ? "bg-cyan-signal" : "bg-stone-rail")}>
          {num}
        </span>
        <span className="flex flex-col gap-[3px]">
          <span id={id} className="text-[17px] font-semibold">
            {title}
          </span>
          <span className="text-sm leading-relaxed text-warm-gray">{sub}</span>
        </span>
      </span>
      {children}
    </section>
  );
}

export function Note({ icon: Icon = Info, children, className }: { icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2.5 rounded-[12px] bg-stone-rail px-4 py-3.5 text-sm leading-relaxed", className)}>
      <Icon className="mt-0.5 h-[18px] w-[18px] flex-none" strokeWidth={1.6} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
