import type { Metadata } from "next";
import Link from "next/link";
import { Tent } from "lucide-react";

export const metadata: Metadata = {
  title: "Camp — Admin",
  robots: { index: false, follow: false },
};

export default function CampAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin/camp" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
              <Tent className="h-4 w-4 text-emerald-700" />
            </span>
            Camp admin
          </Link>
          <Link href="/admin/login" className="text-sm text-slate-500 hover:text-slate-900">
            Switch portal
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
