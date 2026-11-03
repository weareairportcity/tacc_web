import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { CommuneLogo } from "@/components/camp/brand";
import { BiggerText, biggerTextScript } from "@/components/camp/BiggerText";
import { ServiceWorker } from "@/components/camp/ServiceWorker";
import { Collector } from "@/components/camp/Collector";
import { CookieNotice } from "@/components/camp/CookieNotice";
import { Seen } from "@/components/camp/Seen";
import "@/components/camp/commune.css";

export const metadata: Metadata = {
  title: "Commune · The Airport City Church camps",
  robots: { index: false, follow: false },
  manifest: "/camps/manifest.webmanifest",
  icons: { apple: "/commune/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Commune", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#fafaf9" };

export default function CampsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="cm-root min-h-screen bg-stone-canvas font-sans text-ink-black selection:bg-sky-wash">
      <script dangerouslySetInnerHTML={{ __html: biggerTextScript }} />
      <header className="mx-auto flex h-16 max-w-xl items-center justify-between px-5">
        <Link href="/camps" className="flex items-center gap-2 text-[15px] font-medium text-ink-black">
          <CommuneLogo label={null} />
          commune
        </Link>
        <BiggerText />
      </header>
      <main className="mx-auto max-w-xl px-5 pb-16">{children}</main>
      <ServiceWorker />
      <footer className="mx-auto flex max-w-xl flex-col items-center gap-2 px-5 pb-10 text-center text-xs text-warm-gray">
        <span>Commune is the camp app of The Airport City Church.</span>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/camps/privacy" className="min-h-8 py-1.5 underline decoration-stone-muted underline-offset-[3px]">Privacy</Link>
          <Link href="/camps/terms" className="min-h-8 py-1.5 underline decoration-stone-muted underline-offset-[3px]">Terms</Link>
          <Link href="/camps/cookies" className="min-h-8 py-1.5 underline decoration-stone-muted underline-offset-[3px]">Cookies</Link>
        </nav>
      </footer>
      <Collector area="attendee" />
      <Seen staff={false} />
      <CookieNotice />
    </div>
  );
}
