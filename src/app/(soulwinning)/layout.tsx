import type { Metadata } from "next";
import type { Viewport } from "next";

export const metadata: Metadata = {
  title: "Soul Winning Tracker — The Airport City Church",
  description: "Log every soul won during the outreach.",
};

export const viewport: Viewport = {
  themeColor: "#3ba6f1",
  // The entry form is used one-handed outdoors — keep it from zooming on focus.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function SoulWinningLayout({
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
