import type { Metadata } from "next";
import { OutreachEnded } from "./OutreachEnded";

// The outreach is over. This used to be a live, force-dynamic page that polled
// Supabase from every open phone and projector; it is now static so it costs
// nothing to leave open. The live version is in git history before this change.
export const metadata: Metadata = {
  title: "1909 — Souls Won for Christ",
  description: "Souls won for Christ, live.",
};

export default function Page() {
  return <OutreachEnded />;
}
