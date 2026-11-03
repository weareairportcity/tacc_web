import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/camp/ServiceWorker";
import { Collector } from "@/components/camp/Collector";
import { CookieNotice } from "@/components/camp/CookieNotice";
import { Seen } from "@/components/camp/Seen";
import { onLeadersSide } from "@/lib/camp/auth";
import "@/components/camp/commune.css";

export const metadata: Metadata = {
  title: "Commune · Coordinators",
  robots: { index: false, follow: false },
  manifest: "/admin/camp/manifest.webmanifest",
  icons: { apple: "/commune/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Commune", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#fafaf9" };

/** The coordinator side of Commune. Each camp adds its own sidebar ([campId]/layout.tsx). */
export default async function CampAdminLayout({ children }: { children: React.ReactNode }) {
  // Only a header the proxy sets: no sign-in check here.
  const leader = await onLeadersSide();
  return (
    <div className="min-h-screen bg-stone-canvas font-sans text-ink-black selection:bg-sky-wash">
      {children}
      <ServiceWorker />
      <Collector area={leader ? "leader" : "coordinator"} />
      <Seen staff />
      <CookieNotice raised />
    </div>
  );
}
