import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/camp/ServiceWorker";
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
export default function CampAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-canvas font-sans text-ink-black selection:bg-sky-wash">
      {children}
      <ServiceWorker />
    </div>
  );
}
