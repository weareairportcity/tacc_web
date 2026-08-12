import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Portal — Camp Meeting",
  description: "TACC Church Camp Meeting Admin Dashboard",
};

export default function PortalAdminLayout({
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
