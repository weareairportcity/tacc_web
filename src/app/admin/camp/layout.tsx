import type { Metadata } from "next";
import "@/components/camp/commune.css";

export const metadata: Metadata = {
  title: "Commune · Coordinator",
  robots: { index: false, follow: false },
};

/** The coordinator side of Commune. Each camp adds its own sidebar ([campId]/layout.tsx). */
export default function CampAdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-stone-canvas font-sans text-ink-black selection:bg-sky-wash">{children}</div>;
}
