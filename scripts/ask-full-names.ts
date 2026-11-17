/**
 * One text to each active attendee who registered with a single name, asking
 * them to add their full name in Commune (they're asked on their page too).
 * Dry run by default: lists who and the exact text. --send texts them.
 *
 *   npx tsx --env-file=.env.local scripts/ask-full-names.ts          # dry run
 *   npx tsx --env-file=.env.local scripts/ask-full-names.ts --send   # texts them
 */
import { query } from "@/lib/cf";
import { sendCampText } from "@/lib/camp/sms-log";
import { isFullName } from "@/lib/camp/names";

const ORIGIN = "https://commune.theairportcitychurch.com";
const send = process.argv.includes("--send");

async function main() {
  const rows = await query<{ id: string; camp_id: string; slug: string; camp: string; full_name: string; phone: string }>(
    "app",
    `SELECT r.id, r.camp_id, c.slug, c.name AS camp, r.full_name, r.phone FROM camp_registrations r JOIN camps c ON c.id = r.camp_id
     WHERE c.status IN ('open', 'closed') AND r.status <> 'cancelled' AND r.deleted_at IS NULL`,
  );
  const people = rows.filter((r) => !isFullName(r.full_name));
  console.log(`${people.length} to ask${send ? "" : " (dry run: nothing sent)"}\n`);
  for (const p of people) {
    const text = `Hi ${p.full_name.trim()}, please add your full name (first name and surname) for ${p.camp} in Commune: ${ORIGIN}/${p.slug}/me - The Airport City Church`;
    console.log(`${p.full_name} · 0${p.phone.slice(3)}\n  ${text}\n`);
    if (send) console.log((await sendCampText(p.camp_id, "message", p.phone, text)) ? "  sent\n" : "  NOT sent\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
