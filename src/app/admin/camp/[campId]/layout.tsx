import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { getCamp, ID, listCamps } from "@/lib/camp/camps";
import { navCounts } from "@/lib/camp/reports";
import { CommuneLogo } from "@/components/camp/brand";
import { CampLogo } from "@/components/camp/photos";
import { BottomBar, FindPerson, PhoneSearch, Rail } from "@/components/camp/shell/nav";
import { SignOutButton } from "@/components/camp/SignOutButton";
import { ToastProvider } from "@/components/camp/toast";
import { leaderName } from "@/lib/camp/leaders";
import { listMyOpenBulkPayments } from "@/lib/camp/payments";
import { pageStaff } from "../access";
import { OpenPayments } from "./OpenPayments";

/**
 * One camp's coordinator app: a rail and top bar on wide screens, a header
 * and bottom bar on phones. Pages still check roles themselves.
 */
export default async function CampShell({ children, params }: { children: React.ReactNode; params: Promise<{ campId: string }> }) {
  const { campId } = await params;
  const staff = await pageStaff("coordinator", "leader");
  const camp = staff && ID.test(campId) ? await getCamp(campId) : null;
  if (!staff || !camp) return <div className="mx-auto max-w-5xl px-5 py-8">{children}</div>;
  const leader = staff.role === "leader";
  const [counts, camps, open] = await Promise.all([
    leader ? { requests: 0 } : navCounts(camp.id),
    listCamps(),
    leader ? [] : listMyOpenBulkPayments(camp.id, staff.email).catch(() => []),
  ]);
  const base = `/admin/camp/${camp.id}`;
  const switchable = camps.filter((c) => c.status !== "archived" && (!leader || c.status !== "draft"));

  const switcher = (
    <details className="group relative">
      <summary className="cm-press flex h-10 cursor-pointer list-none items-center gap-2.5 rounded-full border border-stone-border bg-white pl-1.5 pr-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <CampLogo camp={camp} size={28} className="rounded-full" />
        <span className="max-w-[180px] truncate">{camp.name}</span>
        <ChevronDown className="h-4 w-4 text-warm-gray transition-transform group-open:rotate-180" strokeWidth={1.6} aria-hidden="true" />
        <span className="sr-only">Switch camp</span>
      </summary>
      <div className="cm-pop absolute left-0 top-12 z-50 w-72 origin-top-left rounded-[12px] border border-stone-border bg-white p-1.5 shadow-[0_16px_40px_rgba(17,12,46,0.14)]">
        {switchable.map((c) => (
          <Link
            key={c.id}
            href={leader ? `/admin/camp/${c.id}/people` : `/admin/camp/${c.id}`}
            className="cm-hover flex min-h-11 items-center gap-2.5 rounded-[8px] px-2.5 text-sm"
          >
            <CampLogo camp={c} size={26} />
            <span className="flex-1 truncate">{c.name}</span>
            {c.id === camp.id && <Check className="h-4 w-4" strokeWidth={2} aria-label="Current camp" />}
          </Link>
        ))}
        <Link href="/admin/camp" className="cm-hover mt-1 flex min-h-11 items-center rounded-[8px] border-t border-stone-border px-2.5 text-sm text-warm-gray">
          All camps
        </Link>
      </div>
    </details>
  );

  return (
    <ToastProvider>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[216px] flex-none flex-col gap-5 border-r border-stone-border bg-stone-rail px-3 py-[18px] lg:flex">
          <Link href="/admin/camp" className="flex items-center gap-2 px-2">
            <CommuneLogo size={26} label={null} />
            <span className="text-[15px] font-medium">commune</span>
          </Link>
          <Rail base={base} leader={leader} requests={counts.requests} />
          <span className="mt-auto flex flex-col gap-0.5 px-2 text-xs text-[#6f6863]">
            <span className="truncate">{leaderName(staff.email) ?? staff.email}</span>
            <SignOutButton className="self-start text-[#6f6863]" />
          </span>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-stone-border bg-stone-canvas/95 px-4 backdrop-blur-sm lg:px-7">
            {switcher}
            <FindPerson base={base} campId={camp.id} leader={leader} className="ml-auto w-full max-w-[420px] max-sm:hidden lg:ml-0" />
            <PhoneSearch base={base} campId={camp.id} leader={leader} />
          </header>
          <main className="w-full max-w-[1080px] flex-1 px-4 pb-32 pt-6 lg:px-7 lg:pb-16">{children}</main>
        </div>
      </div>
      {!leader && <OpenPayments campId={camp.id} payments={open} />}
      <BottomBar base={base} leader={leader} requests={counts.requests} />
    </ToastProvider>
  );
}
