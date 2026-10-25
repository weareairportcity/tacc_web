"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, CircleCheck, DoorOpen, LayoutGrid, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { path: "", label: "Dashboard", icon: LayoutGrid },
  { path: "/registrations", label: "People", icon: Users },
  { path: "/rooms", label: "Rooms", icon: BedDouble },
  { path: "/assign", label: "Assign rooms", icon: DoorOpen },
  { path: "/reconcile", label: "Check against Paystack", icon: CircleCheck },
  { path: "/settings", label: "Settings", icon: Settings },
];

/** The camp sidebar's links. Leaders only get their read-only people list. */
export function AdminNav({ campId, leader, counts }: { campId: string; leader: boolean; counts: { people: number; waiting: number } }) {
  const pathname = usePathname();
  const base = `/admin/camp/${campId}`;
  const items = leader ? [{ path: "/people", label: "People", icon: Users }] : ITEMS;
  return (
    <nav aria-label="Camp" className="flex flex-col gap-0.5 text-sm">
      {items.map(({ path, label, icon: Icon }) => {
        const href = base + path;
        const active = path === "" ? pathname === base : pathname.startsWith(href);
        const count = path === "/registrations" ? counts.people : path === "/assign" ? counts.waiting : null;
        return (
          <Link
            key={path}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-2.5 rounded-full px-2.5 transition-colors",
              active ? "bg-soot text-white" : "cm-hover text-ink-black",
            )}
          >
            <Icon className="h-[17px] w-[17px]" strokeWidth={1.6} aria-hidden="true" />
            {label}
            {count !== null && count > 0 && (
              <span className={cn("ml-auto text-xs tabular-nums", active ? "text-stone-muted" : "text-warm-gray")}>{count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
