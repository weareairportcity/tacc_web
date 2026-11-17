import { notFound } from "next/navigation";
import { getCamp, ID } from "@/lib/camp/camps";
import { listRecipients } from "@/lib/camp/broadcast";
import { listBroadcasts, smsUse } from "@/lib/camp/sms-log";
import { smsBalance } from "@/lib/mnotify";
import { NoAccess, pageStaff } from "../../access";
import { TextsView } from "./TextsView";

// Sending to a few hundred people takes a while.
export const maxDuration = 300;

/**
 * Texts: send one message to everyone registered (or part of them), see what
 * it will cost before it goes, and where this camp's credits have gone.
 */
export default async function TextsPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const [camp, recipients, use, broadcasts, balance] = await Promise.all([getCamp(campId), listRecipients(campId), smsUse(campId), listBroadcasts(campId), smsBalance()]);
  if (!camp) notFound();
  // No phone numbers go to the browser: first names, payment and app status only.
  return <TextsView camp={camp} recipients={recipients.map(({ full_name, status, app }) => ({ full_name, status, app }))} use={use} broadcasts={broadcasts} balance={balance} />;
}
