import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSongsAdmin } from "@/lib/code-session";
import { SongsAdmin } from "./SongsAdmin";

export const metadata: Metadata = {
  title: "Song of the Week — Admin",
  robots: { index: false, follow: false },
};

export default async function SongsAdminPage() {
  if (!(await isSongsAdmin())) redirect("/admin/login");
  return <SongsAdmin />;
}
