import type { Metadata } from "next";
import { isAdmin } from "@/lib/soulwinning/admin-auth";
import { AdminDashboard } from "./AdminDashboard";
import { AdminGate } from "./AdminGate";

export const metadata: Metadata = {
  title: "Soul Winning — Admin",
  robots: { index: false, follow: false },
};

/** Without a valid admin code cookie, only the code form is rendered. */
export default async function SoulWinningAdminPage() {
  return (await isAdmin()) ? <AdminDashboard /> : <AdminGate />;
}
