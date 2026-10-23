import type { Metadata } from "next";
import { Tent } from "lucide-react";

export const metadata: Metadata = {
  title: "Camp — The Airport City Church",
  robots: { index: false, follow: false },
};

export default function CampsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
            <Tent className="h-4 w-4 text-emerald-700" />
          </span>
          TACC Camp
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
