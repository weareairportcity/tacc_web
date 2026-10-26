import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock, CreditCard, Inbox, MessageSquareHeart, Settings } from "lucide-react";
import { ID } from "@/lib/camp/camps";
import { navCounts } from "@/lib/camp/reports";
import { SignOutButton } from "@/components/camp/SignOutButton";
import { headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";

/** Phones: the pages that don't fit in the bottom bar. */
export default async function MorePage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const { requests } = await navCounts(campId);
  const base = `/admin/camp/${campId}`;
  const items = [
    { href: `${base}/requests`, icon: Inbox, label: "Requests", count: requests },
    { href: `${base}/money`, icon: CreditCard, label: "Money", count: 0 },
    { href: `${base}/history`, icon: Clock, label: "History", count: 0 },
    { href: `${base}/feedback`, icon: MessageSquareHeart, label: "Feedback", count: 0 },
    { href: `${base}/settings`, icon: Settings, label: "Settings", count: 0 },
  ];
  return (
    <div className="flex flex-col gap-5">
      <h1 className={`${headlineClass} text-[34px]`}>More</h1>
      <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
        {items.map(({ href, icon: Icon, label, count }) => (
          <li key={href} className="border-t border-stone-border first:border-t-0">
            <Link href={href} className="cm-row flex min-h-14 items-center gap-3.5 px-4">
              <Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
              <span className="flex-1 text-[15px] font-medium">{label}</span>
              {count > 0 && <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-cyan-signal px-1.5 text-xs font-semibold">{count}</span>}
              <ChevronRight className="h-4 w-4 text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-1.5 text-sm text-warm-gray">
        {staff.email} · <SignOutButton />
      </p>
    </div>
  );
}
