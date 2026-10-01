import type { Metadata } from "next";
import { songsAdmin } from "@/lib/code-session";
import { SongsAdmin } from "./SongsAdmin";
import { SongsGate } from "./SongsGate";

export const metadata: Metadata = {
  title: "Song of the Week — Admin",
  robots: { index: false, follow: false },
};

/** Without a valid songs admin cookie, only the code form is rendered. */
export default async function SongsAdminPage() {
  return (await songsAdmin.isValid()) ? <SongsAdmin /> : <SongsGate />;
}
