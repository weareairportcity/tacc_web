"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { BedDouble, Clock, CreditCard, Ellipsis, Inbox, LayoutGrid, ScanLine, Search, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Commune's coordinator navigation: a rail on wide screens, a bottom bar on
 * phones. Today first, Settings last; Requests carries its count.
 */

type Item = { path: string; label: string; icon: typeof Users };

export const NAV: Item[] = [
  { path: "", label: "Today", icon: LayoutGrid },
  { path: "/people", label: "People", icon: Users },
  { path: "/rooms", label: "Rooms", icon: BedDouble },
  { path: "/check-in", label: "Check-in", icon: ScanLine },
  { path: "/requests", label: "Requests", icon: Inbox },
  { path: "/money", label: "Money", icon: CreditCard },
  { path: "/history", label: "History", icon: Clock },
  { path: "/settings", label: "Settings", icon: Settings },
];
const LEADER_NAV: Item[] = [{ path: "/people", label: "People", icon: Users }];
// Phones: four destinations and More (the rest).
const BAR = ["", "/people", "/check-in", "/rooms"];

function useActive(base: string) {
  const pathname = usePathname();
  return (path: string) => (path === "" ? pathname === base : pathname.startsWith(base + path));
}

export function Rail({ base, leader, requests }: { base: string; leader: boolean; requests: number }) {
  const active = useActive(base);
  return (
    <nav aria-label="Coordinator" className="flex flex-col gap-0.5 text-sm">
      {(leader ? LEADER_NAV : NAV).map(({ path, label, icon: Icon }) => {
        const on = active(path);
        return (
          <Link
            key={path}
            href={base + path}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex h-[42px] items-center gap-3 rounded-[10px] px-3 font-medium transition-colors",
              on ? "bg-white text-ink-black shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_#e8e6e5]" : "cm-hover text-[#57534e]",
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />
            {label}
            {path === "/requests" && requests > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-signal px-1.5 text-[11px] font-semibold text-ink-black">
                {requests}
                <span className="sr-only"> waiting</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomBar({ base, leader, requests }: { base: string; leader: boolean; requests: number }) {
  const active = useActive(base);
  const items = leader ? LEADER_NAV : [...NAV.filter((n) => BAR.includes(n.path)), { path: "/more", label: "More", icon: Ellipsis }];
  const moreActive = !leader && NAV.some((n) => !BAR.includes(n.path) && active(n.path));
  return (
    <nav
      aria-label="Coordinator"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-stone-border bg-white px-1.5 pb-[max(12px,env(safe-area-inset-bottom))] pt-1 lg:hidden"
    >
      {items.map(({ path, label, icon: Icon }) => {
        const on = path === "/more" ? moreActive || active("/more") : active(path);
        return (
          <Link
            key={path}
            href={base + path}
            aria-current={on ? "page" : undefined}
            className={cn("relative flex flex-1 flex-col items-center gap-0.5 pb-1 pt-1.5 text-[11px]", on ? "font-semibold text-ink-black" : "font-medium text-warm-gray")}
          >
            <span className={cn("flex h-[30px] w-14 items-center justify-center rounded-full transition-colors", on && "bg-soot text-white")}>
              <Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
            </span>
            {label}
            {path === "/more" && requests > 0 && (
              <span className="absolute right-[calc(50%-22px)] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-cyan-signal">
                <span className="sr-only">{requests} requests waiting</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** "Find a person" in the top bar. "/" jumps to it from anywhere. */
export function FindPerson({ base, className }: { base: string; className?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      className={cn("relative flex", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const q = ref.current?.value.trim();
        router.push(`${base}/people${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-warm-gray" strokeWidth={1.6} aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        aria-label="Find a person"
        placeholder="Find a person"
        className="h-10 w-full rounded-full border border-stone-border bg-white pl-10 pr-10 text-sm placeholder:text-warm-gray focus:outline-2 focus:outline-offset-1 focus:outline-cyan-signal"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-stone-border bg-stone-canvas px-1.5 text-xs text-warm-gray sm:block">/</kbd>
    </form>
  );
}
