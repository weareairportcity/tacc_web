import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { assignGroup, assignPerson, getPoolBoard, listPools } from "@/lib/camp/assignments";
import { createCamp, getCamp } from "@/lib/camp/camps";
import { createGroup, getGroupFor, joinByCode } from "@/lib/camp/groups";
import { startPayment } from "@/lib/camp/payments";
import { register } from "@/lib/camp/registrations";
import { getDashboard, listPeople, peopleCsv } from "@/lib/camp/reports";
import { createRoom, createRoomType } from "@/lib/camp/rooms";
import type { Camp, Gender, Registration } from "@/lib/camp/types";
import { sendWebhook, startFakePaystack, succeed } from "../setup/paystack";

/**
 * Phase 7 load check: a 700-person camp end to end on the local Worker and
 * D1, with work fired in parallel the way a busy registration week would.
 * Run on its own (it uses the fake Paystack port):
 *   CAMP_LOAD=1 npx vitest run tests/load
 * Timings print at the end; docs/camp/LOAD_CHECK.md records a run.
 */

const PEOPLE = 700;
const ACTOR = "load@test.local";
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const timings: [string, number][] = [];

async function timed<T>(label: string, fn: () => Promise<T>) {
  const start = performance.now();
  const result = await fn();
  timings.push([label, Math.round(performance.now() - start)]);
  return result;
}

/** Runs `fn` over `items`, `width` at a time. */
async function inParallel<T, R>(items: T[], width: number, fn: (item: T, i: number) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += width) {
    out.push(...(await Promise.all(items.slice(i, i + width).map((item, j) => fn(item, i + j)))));
  }
  return out;
}

const run = Boolean(process.env.CAMP_LOAD);

describe.skipIf(!run)("a 700-person camp", { timeout: 900_000 }, () => {
  let paystack: Server;
  let camp: Camp;
  let hostel: string;
  let suite: string;
  let people: Registration[] = [];

  beforeAll(async () => {
    paystack = await startFakePaystack();
  });
  afterAll(() => new Promise<void>((resolve) => (paystack ? paystack.close(() => resolve()) : resolve())));

  // 390 women + 240 men in four-bed Hostel rooms, 40 women + 30 men in two-bed Suites: 700 people, 710 beds.
  const plan: { type: "hostel" | "suite"; gender: Gender; people: number; rooms: number }[] = [
    { type: "hostel", gender: "female", people: 390, rooms: 100 },
    { type: "hostel", gender: "male", people: 240, rooms: 60 },
    { type: "suite", gender: "female", people: 40, rooms: 20 },
    { type: "suite", gender: "male", people: 30, rooms: 15 },
  ];

  it("sets up the camp and its 195 rooms", async () => {
    await timed("setup: camp, 2 room types, 195 rooms", async () => {
      const id = await createCamp(ACTOR, {
        name: `Load Camp ${crypto.randomUUID().slice(0, 6)}`,
        venue: "Load",
        starts_on: day(60),
        ends_on: day(63),
        registration_opens_on: day(-1),
        registration_closes_on: day(30),
        payment_due_on: day(45),
        roommate_deadline_on: day(50),
        fee_bps: 195,
        status: "open",
      });
      camp = (await getCamp(id))!;
      hostel = await createRoomType(ACTOR, id, { name: "Hostel", price_pesewas: 60000, capacity: 4 });
      suite = await createRoomType(ACTOR, id, { name: "Suite", price_pesewas: 90000, capacity: 2 });
      const rooms = plan.flatMap((p) =>
        Array.from({ length: p.rooms }, (_, i) => ({
          label: `${p.type[0].toUpperCase()}${p.gender[0].toUpperCase()}${i + 1}`,
          room_type_id: p.type === "hostel" ? hostel : suite,
          gender: p.gender,
          capacity: p.type === "hostel" ? 4 : 2,
        })),
      );
      await inParallel(rooms, 20, (r) => createRoom(ACTOR, id, r));
    });
  });

  it("registers 700 people, 50 at a time", async () => {
    const forms = plan.flatMap((p) =>
      Array.from({ length: p.people }, () => ({ type: p.type === "hostel" ? hostel : suite, gender: p.gender })),
    );
    const ids = await timed("register 700 (50 in parallel)", () =>
      inParallel(forms, 50, (f, i) =>
        register(camp, {
          full_name: `Person ${String(i + 1).padStart(3, "0")}`,
          phone: `020${String(1_000_000 + i).slice(1)}`.padEnd(10, "0").slice(0, 10),
          email: `p${i}@load.test`,
          gender: f.gender,
          fellowship: i % 2 ? "Qadash" : "Chosen",
          church: "TACC",
          room_type_id: f.type,
        }).then((r) => r.id),
      ),
    );
    expect(new Set(ids).size).toBe(PEOPLE);
  });

  it("takes every payment, half of them in two instalments, with duplicate webhooks", async () => {
    const regs = await query<{ id: string; price_pesewas: number }>(
      "app",
      "SELECT id, price_pesewas FROM camp_registrations WHERE camp_id = ? ORDER BY full_name",
      [camp.id],
    );
    const instalments = regs.flatMap((r, i) =>
      i % 2 ? [{ id: r.id, amount: r.price_pesewas }] : [{ id: r.id, amount: 20000 }, { id: r.id, amount: r.price_pesewas - 20000 }],
    );
    // Each person's instalments in order; different people in parallel.
    const byPerson = new Map<string, { id: string; amount: number }[]>();
    for (const p of instalments) byPerson.set(p.id, [...(byPerson.get(p.id) ?? []), p]);
    let webhooks = 0;
    await timed(`${instalments.length} payments + webhooks (25 people in parallel, 1 in 5 webhooks sent twice)`, () =>
      inParallel([...byPerson.values()], 25, async (mine) => {
        for (const p of mine) {
          const checkout = await startPayment(p.id, p.amount, "http://localhost/camps/load/paid");
          succeed(checkout.reference);
          const twice = webhooks++ % 5 === 0;
          await Promise.all(Array.from({ length: twice ? 2 : 1 }, () => sendWebhook(checkout.reference)));
        }
      }),
    );
    const [totals] = await query<{ fully_paid: number; paid: number; expected: number; payments: number }>(
      "app",
      `SELECT SUM(status = 'fully_paid') AS fully_paid, SUM(paid_pesewas) AS paid, SUM(price_pesewas) AS expected,
         (SELECT COUNT(*) FROM camp_payments p JOIN camp_registrations q ON q.id = p.registration_id
            WHERE q.camp_id = ?1 AND p.status = 'success') AS payments
       FROM camp_registrations WHERE camp_id = ?1`,
      [camp.id],
    );
    expect(totals).toEqual({ fully_paid: PEOPLE, paid: totals.expected, expected: 390 * 60000 + 240 * 60000 + 70 * 90000, payments: instalments.length });
  });

  it("forms groups, with everyone joining at once, and only one of 20 getting the last place", async () => {
    people = await query<Registration>(
      "app",
      `SELECT r.*, t.name AS room_type_name FROM camp_registrations r JOIN camp_room_types t ON t.id = r.room_type_id
       WHERE r.camp_id = ? ORDER BY r.full_name`,
      [camp.id],
    );
    const women = people.filter((p) => p.gender === "female" && p.room_type_id === hostel);
    // 80 groups of four from the first 320 women in Hostel.
    const owners = women.filter((_, i) => i % 4 === 0).slice(0, 80);
    await timed("80 groups: create, then 3 join each (all 240 joins in parallel)", async () => {
      await inParallel(owners, 40, (o) => createGroup(o));
      const codes = await Promise.all(owners.map(async (o) => (await getGroupFor(o.id))!.code));
      await Promise.all(owners.flatMap((o, g) => [1, 2, 3].map((k) => joinByCode(women[women.indexOf(o) + k], codes[g]))));
    });

    // The last place in one group of three, raced by 20 people.
    const racers = women.slice(320, 340);
    const lastOwner = women[340];
    const [m1, m2] = [women[341], women[342]];
    await createGroup(lastOwner);
    const code = (await getGroupFor(lastOwner.id))!.code;
    await joinByCode(m1, code);
    await joinByCode(m2, code);
    const results = await timed("20 people race for one last group place", () =>
      Promise.allSettled(racers.map((r) => joinByCode(r, code))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getGroupFor(lastOwner.id))!.members).toHaveLength(4);
  });

  it("places every group and person, with coordinators working at once", async () => {
    const pools = await listPools(camp.id);
    await timed("assign all 700 (groups first, then individuals; 20 in parallel per pool)", async () => {
      for (const pool of pools) {
        const board = await getPoolBoard(camp.id, pool.room_type_id, pool.gender);
        const free = board.rooms.map((r) => ({ id: r.id, free: r.capacity - r.occupied }));
        const take = (n: number) => {
          const room = free.find((r) => r.free >= n)!;
          room.free -= n;
          return room.id;
        };
        await inParallel(board.groups, 20, (g) => assignGroup(ACTOR, take(g.members.length), g.id));
        await inParallel(board.people, 20, (p) => assignPerson(ACTOR, take(1), p.id));
      }
    });

    // Everyone placed, and no room over its beds (racing assignments are tested in assignments.db.test.ts).
    const [{ placed }] = await query<{ placed: number }>(
      "app",
      `SELECT COUNT(*) AS placed FROM camp_room_assignments a JOIN camp_rooms x ON x.id = a.room_id WHERE x.camp_id = ?`,
      [camp.id],
    );
    expect(placed).toBe(PEOPLE);
    const [{ over }] = await query<{ over: number }>(
      "app",
      `SELECT COUNT(*) AS over FROM camp_rooms x WHERE x.camp_id = ?
         AND (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id) > x.capacity`,
      [camp.id],
    );
    expect(over).toBe(0);
  });

  it("serves the dashboard, the people table and the CSV at full size", async () => {
    const d = await timed("dashboard", () => getDashboard(camp.id));
    expect(d.status.fully_paid).toBe(PEOPLE);
    expect(d.allocation).toMatchObject({ placed: PEOPLE, waiting: 0 });
    expect(d.money.outstanding).toBe(0);
    const rows = await timed("people table, everyone", () => listPeople(camp.id, {}));
    expect(rows).toHaveLength(PEOPLE);
    const csv = await timed("people CSV, everyone", async () => peopleCsv(await listPeople(camp.id, {})));
    expect(csv.trim().split("\r\n")).toHaveLength(PEOPLE + 1);
    await timed("people table, filtered (Qadash, placed)", () => listPeople(camp.id, { fellowship: "Qadash", room: "placed" }));
  });

  afterAll(() => {
    console.log("\nLoad check timings (local Worker + D1):");
    for (const [label, ms] of timings) console.log(`  ${String(ms).padStart(7)} ms  ${label}`);
  });
});
