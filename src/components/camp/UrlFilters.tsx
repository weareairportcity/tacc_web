"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type UrlFilter = { key: string; label: string; options: [string, string][] };

/** Dropdowns that each apply at once and stay in the address, so a filtered page can be shared. */
export function UrlFilters({ filters, reset = ["before"] }: { filters: UrlFilter[]; reset?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    for (const k of reset) next.delete(k);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((f) => (
        <select
          key={f.key}
          aria-label={f.label}
          value={params.get(f.key) ?? ""}
          onChange={(e) => set(f.key, e.target.value)}
          className="h-10 rounded-full border border-stone-border bg-white px-3.5 text-[13px]"
        >
          {f.options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
