import { notFound } from "next/navigation";
import { getCamp, ID } from "@/lib/camp/camps";
import { listRecipients } from "@/lib/camp/broadcast";
import { listBroadcasts, smsUse } from "@/lib/camp/sms-log";
import { smsBalance } from "@/lib/mnotify";
import { NoAccess, pageStaff } from "../../access";
import { TextsView } from "./TextsView";
import { LeadersMessage } from "./LeadersMessage";
import { query } from "@/lib/cf";

// Sending to a few hundred people takes a while.
export const maxDuration = 300;

/**
 * Texts: send one message to everyone registered (or part of them), see what
 * it will cost before it goes, and where this camp's credits have gone.
 */
export default async function TextsPage({ params, searchParams }: { params: Promise<{ campId: string }>; searchParams: Promise<{ to?: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const [camp, recipients, use, broadcasts, balance, leaders] = await Promise.all([
    getCamp(campId),
    listRecipients(campId),
    smsUse(campId),
    listBroadcasts(campId),
    smsBalance(),
    query<{ codes: number; phones: number }>(
      "app",
      "SELECT COUNT(*) AS codes, (SELECT COUNT(*) FROM camp_push_subs s WHERE s.owner LIKE 'leader:%') AS phones FROM camp_leader_codes WHERE revoked_at IS NULL",
    ),
  ]);
  if (!camp) notFound();
  const { to } = await searchParams;
  // No phone numbers go to the browser: first names, payment and app status only.
  return (
    <div className="flex flex-col gap-6">
      <TextsView camp={camp} recipients={recipients.map(({ full_name, status, app }) => ({ full_name, status, app }))} use={use} broadcasts={broadcasts} balance={balance} audience={to === "noapp" || to === "owing" || to === "paid" ? to : "all"} />
      <LeadersMessage campId={camp.id} codes={leaders[0]?.codes ?? 0} phones={leaders[0]?.phones ?? 0} />
    </div>
  );
}
