"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Who, what and when. Each change applies at once and stays in the URL. */
export function HistoryFilters({ actors, kinds }: { actors: string[]; kinds: [string, string][] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.delete("before");
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const select = (key: string, label: string, options: [string, string][]) => (
    <select aria-label={label} value={params.get(key) ?? ""} onChange={(e) => set(key, e.target.value)} className="h-10 rounded-full border border-stone-border bg-white px-3.5 text-[13px]">
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {select("who", "Who", [["", "Anyone"], ["attendees", "Attendees"], ["paystack", "Paystack"], ...actors.map((a) => [a, a.split("@")[0]] as [string, string])])}
      {select("what", "What", [["", "Everything"], ...kinds])}
      {select("when", "When", [["", "Any time"], ["1", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"]])}
    </div>
  );
}
