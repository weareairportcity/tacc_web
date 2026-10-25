import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { getCamp, ID } from "@/lib/camp/camps";
import { navCounts } from "@/lib/camp/reports";
import { AdminNav } from "@/components/camp/AdminNav";
import { CommuneLogo } from "@/components/camp/brand";
import { formatDate } from "@/components/camp/ui";
import { pageStaff } from "../access";

/** One camp's coordinator shell: the sidebar, then the page. Pages still check roles themselves. */
export default async function CampShell({ children, params }: { children: React.ReactNode; params: Promise<{ campId: string }> }) {
  const { campId } = await params;
  const staff = await pageStaff("coordinator", "leader");
  const camp = staff && ID.test(campId) ? await getCamp(campId) : null;
  if (!staff || !camp) return <div className="mx-auto max-w-5xl px-5 py-8">{children}</div>;
  const counts = staff.role === "leader" ? { people: 0, waiting: 0 } : await navCounts(camp.id);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex flex-col gap-6 border-b border-stone-border px-4 py-5 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:flex-none lg:border-r-0 lg:border-b-0">
        <Link href="/admin/camp" className="flex items-center gap-2 px-2">
          <CommuneLogo label={null} />
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-medium">commune</span>
            <span className="text-xs text-warm-gray">{staff.role === "leader" ? "Leader" : "Coordinator"}</span>
          </span>
        </Link>
        <Link href="/admin/camp" className="cm-press flex items-center gap-2.5 rounded-[10px] border border-stone-border bg-white p-2.5">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{camp.name}</span>
            <span className="text-xs text-warm-gray">
              {formatDate(camp.starts_on)} – {formatDate(camp.ends_on)}
            </span>
          </span>
          <ArrowLeftRight className="h-4 w-4 flex-none text-warm-gray" strokeWidth={1.6} aria-label="Switch camp" />
        </Link>
        <AdminNav campId={camp.id} leader={staff.role === "leader"} counts={counts} />
        <span className="mt-auto hidden px-2.5 text-xs text-warm-gray lg:block">
          {staff.email} ·{" "}
          <Link href="/admin/login" className="text-warm-gray underline decoration-stone-muted underline-offset-[3px] hover:text-ink-black">
            Switch portal
          </Link>
        </span>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-7 lg:px-8">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
