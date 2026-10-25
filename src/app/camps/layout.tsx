import type { Metadata } from "next";
import Link from "next/link";
import { CommuneLogo } from "@/components/camp/brand";
import "@/components/camp/commune.css";

export const metadata: Metadata = {
  title: "Commune · The Airport City Church camps",
  robots: { index: false, follow: false },
};

export default function CampsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-canvas font-sans text-ink-black selection:bg-sky-wash">
      <header className="mx-auto flex h-16 max-w-xl items-center px-5">
        <Link href="/camps" className="flex items-center gap-2 text-[15px] font-medium text-ink-black">
          <CommuneLogo label={null} />
          commune
        </Link>
      </header>
      <main className="mx-auto max-w-xl px-5 pb-16">{children}</main>
      <footer className="mx-auto flex max-w-xl flex-col items-center gap-2 px-5 pb-10 text-center text-xs text-warm-gray">
        <span>Commune is the camp app of The Airport City Church.</span>
      </footer>
    </div>
  );
}
