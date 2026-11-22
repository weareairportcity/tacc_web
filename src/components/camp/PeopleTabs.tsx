import Link from "next/link";
import { cn } from "@/lib/utils";

/** People's views: everyone, fellowships ranked, and (coordinators) health. `base`: this side's People address. */
export function PeopleTabs({
  base,
  current,
  health = false,
}: {
  base: string;
  current: "everyone" | "fellowships" | "health";
  health?: boolean;
}) {
  const tabs = [
    { key: "everyone" as const, href: base, label: "Everyone" },
    { key: "fellowships" as const, href: `${base}/fellowships`, label: "Fellowships" },
    ...(health ? [{ key: "health" as const, href: `${base.replace(/\/people$/, "/health")}`, label: "Health" }] : []),
  ];
  return (
    <nav
      aria-label="People views"
      className={cn("grid w-full gap-1 rounded-full border border-stone-border bg-white p-[3px]", health ? "max-w-[420px] grid-cols-3" : "max-w-[320px] grid-cols-2")}
    >
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={cn("cm-press flex h-9 items-center justify-center rounded-full text-sm font-medium", current === t.key ? "bg-soot text-white" : "text-[#57534e]")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
