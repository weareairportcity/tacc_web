import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminTopBar } from "./AdminTopBar";
import { headlineClass } from "./ui";
import { cn } from "@/lib/utils";

const TABS = [
  ["staff", "Staff"],
  ["logs", "Logs"],
  ["online", "Online"],
  ["activity", "Activity"],
] as const;

/** The admin's pages outside any one camp: Staff, Logs, Online and Activity, one tab each. */
export function AdminPage({
  email,
  tab,
  title,
  lead,
  children,
}: {
  email: string;
  tab: (typeof TABS)[number][0];
  title: React.ReactNode;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminTopBar email={email} />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 pb-16 pt-4">
        <Link href="/admin/camp" className="-ml-1 inline-flex min-h-10 items-center gap-1 self-start text-sm">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Camps
        </Link>
        <nav aria-label="Admin" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {TABS.map(([key, label]) => (
            <Link
              key={key}
              href={`/admin/camp/${key}`}
              aria-current={key === tab ? "page" : undefined}
              className={cn(
                "cm-press inline-flex h-10 flex-none items-center rounded-full px-4 text-sm font-medium",
                key === tab ? "bg-soot text-white" : "border border-stone-border bg-white text-ink-black",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2">
          <h1 className={headlineClass}>{title}</h1>
          <p className="text-sm text-warm-gray">{lead}</p>
        </div>
        {children}
      </div>
    </>
  );
}
