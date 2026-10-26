"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BedDouble, Clock, CreditCard, Ellipsis, Inbox, LayoutGrid, MessageSquareHeart, ScanLine, Search, Settings, Users, X } from "lucide-react";
import type { FoundPerson } from "@/lib/camp/reports";
import { cn } from "@/lib/utils";
import { STATUS_COLOR, STATUS_WORD } from "../ui";
import { findPeopleAction } from "@/app/admin/camp/actions";

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
  { path: "/feedback", label: "Feedback", icon: MessageSquareHeart },
  { path: "/settings", label: "Settings", icon: Settings },
];
const LEADER_NAV: Item[] = [
  { path: "/people", label: "People", icon: Users },
  { path: "/check-in", label: "Scan", icon: ScanLine },
];
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

/**
 * "Find a person" in the top bar: results as you type, arrows and Enter to
 * pick, Escape to close. "/" jumps here from anywhere. Coordinators open the
 * person's panel; leaders get their filtered list.
 */
export function FindPerson({ base, campId, leader, className, autoFocus }: { base: string; campId: string; leader: boolean; className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<FoundPerson[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);

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

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) return;
    let stale = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      const r = await findPeopleAction(campId, q);
      if (stale) return;
      setSearching(false);
      setFound(r.ok ? r.data : []);
      setActive(0);
    }, 150);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [term, campId]);

  const q = term.trim();
  const shown = q.length >= 2 ? found : [];
  const go = (person?: FoundPerson) => {
    setOpen(false);
    setTerm("");
    ref.current?.blur();
    if (person && !leader) router.push(`${base}/people?person=${person.id}`);
    else router.push(`${base}/people${q ? `?q=${encodeURIComponent(person?.full_name ?? q)}` : ""}`);
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-warm-gray" strokeWidth={1.6} aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        role="combobox"
        aria-expanded={open && q.length >= 2}
        aria-controls="find-person-results"
        aria-activedescendant={open && shown[active] ? `find-${shown[active].id}` : undefined}
        aria-autocomplete="list"
        aria-label="Find a person"
        placeholder="Find a person"
        autoFocus={autoFocus}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, shown.length));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(shown[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            ref.current?.blur();
          }
        }}
        className="h-10 w-full rounded-full border border-stone-border bg-white pl-10 pr-10 text-sm placeholder:text-warm-gray focus:outline-2 focus:outline-offset-1 focus:outline-cyan-signal [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-stone-border bg-stone-canvas px-1.5 text-xs text-warm-gray sm:block">/</kbd>
      {open && q.length >= 2 && (
        <ul
          id="find-person-results"
          role="listbox"
          aria-label="People found"
          className="cm-pop absolute left-0 right-0 top-12 z-50 origin-top overflow-hidden rounded-[12px] border border-stone-border bg-white p-1.5 shadow-[0_16px_40px_rgba(17,12,46,0.14)]"
        >
          {shown.map((p, i) => (
            <li
              key={p.id}
              id={`find-${p.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-[8px] px-3", i === active && "bg-stone-canvas")}
            >
              <span className={cn("h-2 w-2 flex-none rounded-[2px]", STATUS_COLOR[p.status])} aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{p.full_name}</span>
                <span className="truncate text-xs text-warm-gray">
                  {p.fellowship} · {STATUS_WORD[p.status]}
                  {p.room_label ? ` · ${p.room_label}` : ""}
                </span>
              </span>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-3 text-sm text-warm-gray">{searching ? "Searching…" : `Nobody called “${q}”`}</li>}
          {shown.length > 0 && (
            <li
              role="option"
              aria-selected={active === shown.length}
              onMouseDown={(e) => {
                e.preventDefault();
                go();
              }}
              className={cn("mt-1 flex min-h-10 cursor-pointer items-center rounded-[8px] border-t border-stone-border px-3 text-[13px] text-warm-gray", active === shown.length && "bg-stone-canvas")}
            >
              See everyone matching “{q}”
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Phones: a search button that opens the same live search full width under the header. */
export function PhoneSearch({ base, campId, leader }: { base: string; campId: string; leader: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-auto sm:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Close search" : "Find a person"}
        className="cm-press flex h-11 w-11 items-center justify-center rounded-full border border-stone-border bg-white"
      >
        {open ? <X className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" /> : <Search className="h-[18px] w-[18px]" strokeWidth={1.6} aria-hidden="true" />}
      </button>
      {open && (
        <div className="cm-pop absolute inset-x-0 top-16 z-40 border-b border-stone-border bg-stone-canvas px-4 py-3">
          <FindPerson base={base} campId={campId} leader={leader} autoFocus />
        </div>
      )}
    </div>
  );
}
