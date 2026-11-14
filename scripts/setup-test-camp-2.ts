/**
 * Wipes every camp attendee (not coordinators) so testers can register from
 * scratch, then creates Test Camp 2: five GHS 1 room types, 100 places for
 * men and 100 for women on each, T-shirts off, logo and banner uploaded.
 *
 *   npx tsx --env-file=.env.local scripts/setup-test-camp-2.ts --yes
 */
import { readFileSync } from "node:fs";
import { createCamp, listCamps, setCampPhoto } from "@/lib/camp/camps";
import { createRoomType, setPlacesLeft } from "@/lib/camp/rooms";
import { batch, putMedia, query } from "@/lib/cf";

const ACTOR = "support@theairportcitychurch.com";
const NAME = "Test Camp 2";
const PRICE = 100; // GHS 1.00
const PLACES = 100;
const ROOM_TYPES = [
  { name: "Two in a room with AC", capacity: 2 },
  { name: "Two in a room with fan", capacity: 2 },
  { name: "6 in a room with AC", capacity: 6 },
  { name: "6 in a room with fan", capacity: 6 },
  { name: "8 in a room with fan", capacity: 8 },
] as const;

const logoPath = process.env.TEST_CAMP_LOGO ?? "/Users/kanyen/.cursor/projects/Users-kanyen-dev-tacc/assets/test-camp-2-logo.jpg";
const bannerPath = process.env.TEST_CAMP_BANNER ?? "/Users/kanyen/.cursor/projects/Users-kanyen-dev-tacc/assets/test-camp-2-banner.jpg";

if (!process.argv.includes("--yes")) {
  throw new Error("Refusing to run without --yes (this deletes every camp attendee).");
}

async function wipeAttendees() {
  const [{ n }] = await query<{ n: number }>("app", "SELECT COUNT(*) AS n FROM camp_registrations");
  const [{ staff }] = await query<{ staff: number }>("app", "SELECT COUNT(*) AS staff FROM camp_staff");
  console.log(`Attendees before wipe: ${n}. Coordinators left alone: ${staff}.`);
  await batch("app", [{ sql: "UPDATE camp_registrations SET status = 'cancelled' WHERE status <> 'cancelled'", params: [] }]);
  await batch("app", [
    { sql: "DELETE FROM camp_group_invites", params: [] },
    { sql: "DELETE FROM camp_group_members", params: [] },
    { sql: "DELETE FROM camp_groups", params: [] },
    { sql: "DELETE FROM camp_feedback_invites", params: [] },
  ]);
  await batch("app", [{ sql: "DELETE FROM camp_registrations", params: [] }]);
  await batch("app", [
    { sql: "DELETE FROM camp_bulk_payments", params: [] },
    { sql: "DELETE FROM camp_push_subs WHERE owner LIKE 'attendee:%'", params: [] },
    { sql: "DELETE FROM camp_notify_prefs WHERE owner LIKE 'attendee:%'", params: [] },
  ]);
  const [{ left }] = await query<{ left: number }>("app", "SELECT COUNT(*) AS left FROM camp_registrations");
  const [{ staffAfter }] = await query<{ staffAfter: number }>("app", "SELECT COUNT(*) AS staffAfter FROM camp_staff");
  console.log(`Attendees after wipe: ${left}. Coordinators still: ${staffAfter}.`);
}

async function upload(kind: "logo" | "banner", file: string) {
  const body = readFileSync(file);
  const url = await putMedia(`camp-test-camp-2-${kind}-${Date.now()}.jpg`, body, "image/jpeg");
  console.log(`${kind}: ${url}`);
  return url;
}

async function main() {
  await wipeAttendees();

  const existing = (await listCamps()).find((c) => c.slug === "test-camp-2" || c.name === NAME);
  if (existing) {
    console.log(`Camp already exists: ${existing.slug} (${existing.id}). Updating photos, shirts, rooms.`);
    await finish(existing.id, existing.slug);
    return;
  }

  const id = await createCamp(ACTOR, {
    name: NAME,
    venue: "Airport City, Accra",
    starts_on: "2026-12-18",
    ends_on: "2026-12-21",
    registration_opens_on: "2026-11-14",
    registration_closes_on: "2026-12-17",
    payment_due_on: "2026-12-18",
    roommate_deadline_on: "2026-12-17",
    fee_bps: 250,
    momo_fee_bps: 150,
    status: "open",
  });
  const camp = (await listCamps()).find((c) => c.id === id);
  if (!camp) throw new Error("Created camp missing from list.");
  console.log(`Created ${camp.name} → ${camp.slug} (${camp.id})`);
  await finish(camp.id, camp.slug);
}

async function finish(campId: string, slug: string) {
  const logo = await upload("logo", logoPath);
  const banner = await upload("banner", bannerPath);
  await setCampPhoto(ACTOR, campId, "logo", logo, "");
  await setCampPhoto(ACTOR, campId, "banner", banner, "");
  await setCampPhoto(ACTOR, campId, "venue_photo", banner, "");

  const existing = await query<{ name: string; id: string }>("app", "SELECT id, name FROM camp_room_types WHERE camp_id = ?", [campId]);
  const byName = new Map(existing.map((r) => [r.name, r.id]));
  for (const type of ROOM_TYPES) {
    const id = byName.get(type.name) ?? (await createRoomType(ACTOR, campId, { name: type.name, price_pesewas: PRICE, capacity: type.capacity }));
    await setPlacesLeft(ACTOR, id, "male", PLACES);
    await setPlacesLeft(ACTOR, id, "female", PLACES);
    console.log(`Room type ${type.name}: ${id}`);
  }

  console.log(`Share: https://commune.theairportcitychurch.com/camps/${slug}`);
  console.log(`Register: https://commune.theairportcitychurch.com/camps/${slug}/register`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
