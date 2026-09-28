import type { Metadata, Viewport } from "next";
import { Caveat, Cormorant_Garamond } from "next/font/google";

const caveat = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-card-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Happy Birthday, Pastor — Grace in Continuity",
  description: "Send Pastor a birthday note with your photos.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f7f6f3",
  width: "device-width",
  initialScale: 1,
};

export default function GraceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${caveat.variable} ${cormorant.variable} min-h-screen w-full bg-[#f7f6f3] text-[#3a3633] antialiased`}
    >
      {children}
    </div>
  );
}
