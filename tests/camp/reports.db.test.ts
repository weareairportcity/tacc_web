import { beforeAll, describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { assignGroup } from "@/lib/camp/assignments";
import { toCsv } from "@/lib/camp/csv";
import { createGroup, getGroupFor, joinByCode } from "@/lib/camp/groups";
import { cancelRegistration, register } from "@/lib/camp/registrations";
import {
  getDashboard,
  leaderCsv,
  listPeople,
  listPeopleForLeader,
  parsePeopleFilters,
  peopleCsv,
  scopeFor,
  type PeopleFilters,
} from "@/lib/camp/reports";
import { assertRole } from "@/lib/camp/roles";
import { createRoom, createRoomType, setPlacesLeft } from "@/lib/camp/rooms";
import type { Camp, Registration, Staff } from "@/lib/camp/types";
import { ACTOR, attendee, openCamp, paidUp } from "./helpers";

// The dashboard and people lists against a camp with every kind of person in
// it. Expected numbers are worked out by hand from the setup below.

let camp: Camp;
let hostel: string;
let suite: string;
const p = {} as Record<"ama" | "fafa" | "dede" | "esi", Registration>;

const leader = (scope_kind: "fellowship" | "pfcc", scope_value: string): Staff => ({
  email: "leader@test.local",
  role: "leader",
  scope_kind,
  scope_value,
});
const names = (rows: { full_name: string }[]) => rows.map((r) => r.full_name).sort();

beforeAll(async () => {
  ({ camp, roomTypeId: hostel } = await openCamp());
  suite = await createRoomType(ACTOR, camp.id, { name: "Suite", price_pesewas: 90000, capacity: 2 });
  const a1 = await createRoom(ACTOR, camp.id, { label: "A1", room_type_id: hostel, gender: "female", capacity: 4 });
  await createRoom(ACTOR, camp.id, { label: "M1", room_type_id: hostel, gender: "male", capacity: 4 });

  // Ama and Fafa (Qadash, PFCC 2): fully paid, in a group, placed in A1.
  p.ama = await paidUp(camp, hostel, { full_name: "Ama Qadash", fellowship: "Qadash" });
  p.fafa = await paidUp(camp, hostel, { full_name: "Fafa Qadash", fellowship: "Qadash" });
  const group = await createGroup(p.ama);
  await joinByCode(p.fafa, (await getGroupFor(p.ama.id))!.code);
  await assignGroup(ACTOR, a1, group);
  // One real payment row for Ama, for the fee total.
  await query(
    "app",
    `INSERT INTO camp_payments (id, registration_id, reference, amount_pesewas, fee_pesewas, charged_pesewas, status)
     VALUES (?, ?, ?, 60000, 1191, 61191, 'success')`,
    [crypto.randomUUID(), p.ama.id, `TEST-${crypto.randomUUID()}`],
  );

  // Efua (Qadash): GHS 200 of 600 paid. Phone known, for search.
  const efua = await register(camp, attendee(hostel, { full_name: "Efua Qadash", fellowship: "Qadash", phone: "0245557788" }));
  await query("app", "UPDATE camp_registrations SET paid_pesewas = 20000, status = 'partially_paid' WHERE id = ?", [efua.id]);
  // Kofi (Chosen, PFCC 1): registered, nothing paid.
  await register(camp, attendee(hostel, { full_name: "Kofi Chosen", fellowship: "Chosen", gender: "male" }));
  // Dede (Radah, PFCC 2): fully paid for a Suite, no group, no room.
  p.dede = await paidUp(camp, suite, { full_name: "Dede Radah", fellowship: "Radah" });
  // Esi (Chosen): paid in full, then cancelled.
  p.esi = await paidUp(camp, hostel, { full_name: "Esi Chosen", fellowship: "Chosen" });
  await cancelRegistration(ACTOR, p.esi.id);
});

describe("the dashboard", () => {
  it("counts registrations and money exactly", async () => {
    const d = await getDashboard(camp.id);
    expect(d.status).toEqual({ registered: 1, partially_paid: 1, fully_paid: 3, cancelled: 1 });
    expect(d.pastDue).toBe(0);
    expect(d.money).toEqual({
      expected: 60000 * 4 + 90000, // everyone but Esi
      collected: 60000 + 60000 + 20000 + 90000,
      outstanding: 40000 + 60000,
      paidByCancelled: 60000,
      refunded: 0,
      fees: 1191,
      flagged: 0,
    });
    // Past the due date, Efua and Kofi still owe.
    expect((await getDashboard(camp.id, "2999-01-01")).pastDue).toBe(2);
  });

  it("matches independent sums over the registrations table", async () => {
    const d = await getDashboard(camp.id);
    const [raw] = await query<{ expected: number; collected: number; people: number }>(
      "app",
      `SELECT SUM(price_pesewas) AS expected, SUM(paid_pesewas) AS collected, COUNT(*) AS people
       FROM camp_registrations WHERE camp_id = ? AND status <> 'cancelled'`,
      [camp.id],
    );
    expect(d.money.expected).toBe(raw.expected);
    expect(d.money.collected).toBe(raw.collected);
    expect(d.status.registered + d.status.partially_paid + d.status.fully_paid).toBe(raw.people);
    expect(d.byFellowship.reduce((n, b) => n + b.registered + b.partially_paid + b.fully_paid + b.cancelled, 0)).toBe(6);
  });

  it("shows room supply and demand by room type and gender", async () => {
    const d = await getDashboard(camp.id);
    expect(d.supply.map((s) => ({ ...s, room_type_id: undefined }))).toEqual([
      { room_type_id: undefined, room_type_name: "Hostel", gender: "female", registered: 3, fully_paid: 2, beds: 4, placed: 2, places_left: null },
      { room_type_id: undefined, room_type_name: "Hostel", gender: "male", registered: 1, fully_paid: 0, beds: 4, placed: 0, places_left: null },
      { room_type_id: undefined, room_type_name: "Suite", gender: "female", registered: 1, fully_paid: 1, beds: 0, placed: 0, places_left: null },
    ]);
    expect(d.allocation).toEqual({ placed: 2, waiting: 1, unmatched: 1, groups: { open: 1, locked: 0, final: 0 } });
    expect(d.groupsTooBig).toEqual([]);
  });

  it("shows places left from the venue next to supply", async () => {
    const before = await getDashboard(camp.id);
    const hostel = before.supply.find((s) => s.room_type_name === "Hostel" && s.gender === "male")!;
    await setPlacesLeft(ACTOR, hostel.room_type_id, "male", 7);
    const d = await getDashboard(camp.id);
    expect(d.supply.find((s) => s.room_type_id === hostel.room_type_id && s.gender === "male")?.places_left).toBe(7);
    await setPlacesLeft(ACTOR, hostel.room_type_id, "male", null);
  });

  it("breaks counts down by fellowship, PFCC and church", async () => {
    const d = await getDashboard(camp.id);
    expect(d.byFellowship).toEqual([
      { name: "Qadash", registered: 0, partially_paid: 1, fully_paid: 2, cancelled: 0 },
      { name: "Chosen", registered: 1, partially_paid: 0, fully_paid: 0, cancelled: 1 },
      { name: "Radah", registered: 0, partially_paid: 0, fully_paid: 1, cancelled: 0 },
    ]);
    expect(d.byPfcc).toEqual([
      { name: "PFCC 2", registered: 0, partially_paid: 1, fully_paid: 3, cancelled: 0 },
      { name: "PFCC 1", registered: 1, partially_paid: 0, fully_paid: 0, cancelled: 1 },
    ]);
    expect(d.byChurch).toEqual([{ name: "TACC", registered: 1, partially_paid: 1, fully_paid: 3, cancelled: 1 }]);
    expect(d.activity.length).toBeGreaterThan(0);
  });
});

describe("the coordinators' people table", () => {
  const people = (filters: PeopleFilters) => listPeople(camp.id, filters).then(names);

  it("filters by every column", async () => {
    expect(await people({})).toHaveLength(6);
    expect(await people({ status: "fully_paid" })).toEqual(["Ama Qadash", "Dede Radah", "Fafa Qadash"]);
    expect(await people({ fellowship: "Chosen" })).toEqual(["Esi Chosen", "Kofi Chosen"]);
    expect(await people({ pfcc: "PFCC 1" })).toEqual(["Esi Chosen", "Kofi Chosen"]);
    expect(await people({ gender: "male" })).toEqual(["Kofi Chosen"]);
    expect(await people({ room_type: suite })).toEqual(["Dede Radah"]);
    expect(await people({ roommate: "unmatched" })).toEqual(["Dede Radah"]);
    expect(await people({ roommate: "in_group" })).toEqual(["Ama Qadash", "Fafa Qadash"]);
    expect(await people({ roommate: "locked" })).toEqual([]);
    expect(await people({ room: "placed" })).toEqual(["Ama Qadash", "Fafa Qadash"]);
    expect(await people({ room: "waiting" })).toEqual(["Dede Radah"]);
    expect(await people({ status: "fully_paid", fellowship: "Qadash" })).toEqual(["Ama Qadash", "Fafa Qadash"]);
  });

  it("searches names and phone numbers, typed either way", async () => {
    expect(await people({ q: "qadash" })).toEqual(["Ama Qadash", "Efua Qadash", "Fafa Qadash"]);
    expect(await people({ q: "024 555 7788" })).toEqual(["Efua Qadash"]);
    expect(await people({ q: "%" })).toEqual([]);
  });

  it("exports the filtered rows, with money and contact details", async () => {
    const csv = peopleCsv(await listPeople(camp.id, { fellowship: "Qadash", status: "partially_paid" }));
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"Phone"');
    expect(lines[1]).toContain('"233245557788"');
    expect(lines[1]).toContain('"600.00","200.00","400.00"');
  });

  it("drops filter values it doesn't know", () => {
    expect(
      parsePeopleFilters({ status: "bogus", fellowship: "' OR 1=1 --", room_type: "x", roommate: ["unmatched", "x"], q: "  Ama  " }),
    ).toEqual({
      q: "Ama",
      status: undefined,
      fellowship: undefined,
      pfcc: undefined,
      church: undefined,
      gender: undefined,
      room_type: undefined,
      roommate: "unmatched",
      room: undefined,
    });
  });
});

describe("leaders", () => {
  it("see only their own fellowship, whatever they filter by", async () => {
    const qadash = leader("fellowship", "Qadash");
    expect(names(await listPeopleForLeader(qadash, camp.id, {}))).toEqual(["Ama Qadash", "Efua Qadash", "Fafa Qadash"]);
    expect(await listPeopleForLeader(qadash, camp.id, { fellowship: "Chosen" })).toEqual([]);
    expect(await listPeopleForLeader(qadash, camp.id, { pfcc: "PFCC 1" })).toEqual([]);
    expect(names(await listPeopleForLeader(qadash, camp.id, { status: "fully_paid" }))).toEqual(["Ama Qadash", "Fafa Qadash"]);
  });

  it("of a PFCC see every fellowship in it, and no other", async () => {
    expect(names(await listPeopleForLeader(leader("pfcc", "PFCC 2"), camp.id, {}))).toEqual([
      "Ama Qadash",
      "Dede Radah",
      "Efua Qadash",
      "Fafa Qadash",
    ]);
    expect(names(await listPeopleForLeader(leader("pfcc", "PFCC 1"), camp.id, {}))).toEqual(["Esi Chosen", "Kofi Chosen"]);
  });

  it("get paid and outstanding, but no contact details, group codes or room labels", async () => {
    const rows = await listPeopleForLeader(leader("fellowship", "Qadash"), camp.id, {});
    for (const row of rows)
      expect(Object.keys(row).sort()).toEqual(["fellowship", "full_name", "has_room", "id", "paid_pesewas", "pfcc", "price_pesewas", "roommate", "status"]);
    expect(rows.find((r) => r.full_name === "Ama Qadash")).toMatchObject({ status: "fully_paid", roommate: "in_group", has_room: true });

    const csv = leaderCsv(rows);
    expect(csv.split("\r\n")[0]).toBe('﻿"Name","Fellowship","Payment status","Paid (GHS)","Outstanding (GHS)"');
    expect(csv).not.toMatch(/233|@|A1/);
    // Phone search isn't available to leaders.
    expect(await listPeopleForLeader(leader("fellowship", "Qadash"), camp.id, { q: "0245557788" })).toEqual([]);
  });

  it("without a fellowship or PFCC see nothing, and can't use coordinator functions", async () => {
    const unlinked: Staff = { email: "x@test.local", role: "leader", scope_kind: null, scope_value: null };
    await expect(listPeopleForLeader(unlinked, camp.id, {})).rejects.toThrow("isn't linked");
    expect(() => assertRole(leader("fellowship", "Qadash"), ["coordinator"])).toThrow("permission");
    expect(scopeFor({ email: "c@test.local", role: "coordinator", scope_kind: null, scope_value: null })).toEqual({ kind: "all" });
  });
});

describe("CSV", () => {
  it("quotes every field and stops spreadsheet formulas", () => {
    expect(toCsv([["=SUM(A1)", '+1 "x"', "-2", "@cmd", "plain", null, 3]])).toBe(
      `﻿"'=SUM(A1)","'+1 ""x""","'-2","'@cmd","plain","","3"\r\n`,
    );
  });
});
