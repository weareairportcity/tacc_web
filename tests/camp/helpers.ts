import { query } from "@/lib/cf";
import { createCamp, getCamp } from "@/lib/camp/camps";
import { getRegistration, register } from "@/lib/camp/registrations";
import { createRoomType } from "@/lib/camp/rooms";
import type { Camp, CampInput, Registration, RegistrationInput } from "@/lib/camp/types";

export const ACTOR = "coordinator@test.local";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** A camp taking registrations today, with one GHS 600 four-bed room type. */
export async function openCamp(overrides: Partial<CampInput> = {}) {
  const id = await createCamp(ACTOR, {
    // Unique, so parallel test files don't race for the same slug.
    name: `Payments Camp ${crypto.randomUUID().slice(0, 8)}`,
    venue: "Somewhere",
    starts_on: day(60),
    ends_on: day(63),
    registration_opens_on: day(-1),
    registration_closes_on: day(30),
    payment_due_on: day(45),
    roommate_deadline_on: day(50),
    fee_bps: 195,
    status: "open",
    ...overrides,
  });
  const roomTypeId = await createRoomType(ACTOR, id, { name: "Hostel", price_pesewas: 60000, capacity: 4 });
  return { camp: (await getCamp(id))!, roomTypeId };
}

let phoneCounter = 0;
/** A unique, valid Ghana number per call. */
export const nextPhone = () => `024${String(Date.now() % 1_000_000).padStart(6, "0")}${phoneCounter++ % 10}`;

export const attendee = (roomTypeId: string, overrides: Partial<RegistrationInput> = {}): RegistrationInput => ({
  full_name: "Ama Mensah",
  phone: nextPhone(),
  email: "ama@example.com",
  gender: "female",
  fellowship: "Qadash",
  church: "TACC",
  room_type_id: roomTypeId,
  ...overrides,
});

export async function registered(overrides: Partial<RegistrationInput> = {}) {
  const { camp, roomTypeId } = await openCamp();
  const { id, code } = await register(camp, attendee(roomTypeId, overrides));
  return { camp, roomTypeId, id, code };
}

/** Registers someone and marks them Fully Paid directly (payments have their own tests). */
export async function paidUp(camp: Camp, roomTypeId: string, overrides: Partial<RegistrationInput> = {}): Promise<Registration> {
  const { id } = await register(camp, attendee(roomTypeId, overrides));
  await query("app", "UPDATE camp_registrations SET paid_pesewas = price_pesewas, status = 'fully_paid' WHERE id = ?", [id]);
  return (await getRegistration(id))!;
}
