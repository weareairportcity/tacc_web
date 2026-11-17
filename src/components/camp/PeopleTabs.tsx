import Link from "next/link";
import { cn } from "@/lib/utils";

/** People's two views for coordinators: everyone in a list, or fellowships ranked. */
export function PeopleTabs({ campId, current }: { campId: string; current: "everyone" | "fellowships" }) {
  const base = `/admin/camp/${campId}/people`;
  const tabs = [
    { key: "everyone", href: base, label: "Everyone" },
    { key: "fellowships", href: `${base}/fellowships`, label: "Fellowships" },
  ] as const;
  return (
    <nav aria-label="People views" className="grid w-full max-w-[320px] grid-cols-2 gap-1 rounded-full border border-stone-border bg-white p-[3px]">
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
