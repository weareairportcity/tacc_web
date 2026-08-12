import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CampFinder — TACC Church Camp Meeting",
  description: "Church Camp Meeting Room & Key Assignment Portal",
};

export default function CampLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-[#fafaf9] text-[#78716c] font-sans antialiased selection:bg-[#c1e1f7] selection:text-[#3398e1]">
      {children}
    </div>
  );
}
