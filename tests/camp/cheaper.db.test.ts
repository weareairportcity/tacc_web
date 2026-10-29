import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { arrivalCounts, arrivalPage, checkIn, undoCheckIn } from "@/lib/camp/checkin";
import { allow } from "@/lib/camp/rate-limit";
import { getDashboard, listPeople } from "@/lib/camp/reports";
import { register } from "@/lib/camp/registrations";
import { ACTOR, attendee, openCamp, paidUp, paidWithPayment } from "./helpers";

// The changes that keep a 3,000-person camp inside Cloudflare's free daily limits
// (migration 0018 and the Worker's /v1/admin/many) must not change what anyone sees.

describe("rate limits", () => {
  it("refuses past the limit without writing anything more", async () => {
    const key = `test:${crypto.randomUUID()}`;
    for (let i = 0; i < 3; i++) expect(await allow(key, 3, 60_000)).toBe(true);
    for (let i = 0; i < 5; i++) expect(await allow(key, 3, 60_000)).toBe(false);
    // The count stopped one past the limit: the refused attempts changed nothing.
    const [row] = await query<{ count: number }>("app", "SELECT count FROM camp_rate_limits WHERE key = ?", [key]);
    expect(row.count).toBe(4);
  });

  it("starts again once the window has passed", async () => {
    const key = `test:${crypto.randomUUID()}`;
    expect(await allow(key, 1, 60_000)).toBe(true);
    expect(await allow(key, 1, 60_000)).toBe(false);
    await query("app", "UPDATE camp_rate_limits SET window_start = '2000-01-01T00:00:00.000Z' WHERE key = ?", [key]);
    expect(await allow(key, 1, 60_000)).toBe(true);
  });
});

describe("stored totals", () => {
  it("keeps who's arrived as a running total, through check-in and undo", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await paidUp(camp, roomTypeId);
    const b = await paidUp(camp, roomTypeId);
    // No row until the camp's first scan.
    const tally = async () => (await query<{ here: number }>("app", "SELECT here FROM camp_scan_counts WHERE camp_id = ?", [camp.id]))[0]?.here ?? 0;
    expect(await tally()).toBe(0);
    await checkIn(ACTOR, camp.id, a.id);
    await checkIn(ACTOR, camp.id, a.id);
    await checkIn(ACTOR, camp.id, b.id);
    expect(await tally()).toBe(2);
    expect((await arrivalCounts(camp.id)).here).toBe(2);
    await undoCheckIn(ACTOR, camp.id, a.id);
    expect(await tally()).toBe(1);
    expect((await arrivalCounts(camp.id)).here).toBe(1);
  });

  it("shows People and Today the same numbers as before", async () => {
    const { camp, roomTypeId } = await openCamp();
    const paid = await paidWithPayment(camp, roomTypeId);
    await register(camp, attendee(roomTypeId, { full_name: "Owing Person" }));
    const rows = await listPeople(camp.id, {});
    expect(rows.find((r) => r.id === paid.id)).toMatchObject({ status: "fully_paid", flagged: 0 });
    const d = await getDashboard(camp.id);
    expect(d.status).toMatchObject({ fully_paid: 1, registered: 1 });
    expect(d.money.collected).toBe(paid.price_pesewas);
    expect(d.money.outstanding).toBe(paid.price_pesewas);
    expect(d.byFellowship[0]).toMatchObject({ name: "Qadash", fully_paid: 1, registered: 1 });
    expect(d.supply[0]).toMatchObject({ registered: 2, fully_paid: 1 });
  });
});

describe("one request for many queries", () => {
  it("fails only the statement that's wrong", async () => {
    const [good, bad] = await Promise.allSettled([
      query<{ n: number }>("app", "SELECT 1 AS n"),
      query("app", "SELECT * FROM no_such_table"),
    ]);
    expect(good).toMatchObject({ status: "fulfilled", value: [{ n: 1 }] });
    expect(bad.status).toBe("rejected");
  });

  it("loads the check-in lists a page at a time", async () => {
    const { camp, roomTypeId } = await openCamp();
    for (let i = 0; i < 5; i++) await paidUp(camp, roomTypeId, { full_name: `Person ${i}` });
    const first = await arrivalPage(camp.id, "checkin", "notYet", { kind: "all" }, 0, 2);
    const next = await arrivalPage(camp.id, "checkin", "notYet", { kind: "all" }, 2, 2);
    expect(first.map((p) => p.full_name)).toEqual(["Person 0", "Person 1"]);
    expect(next.map((p) => p.full_name)).toEqual(["Person 2", "Person 3"]);
  });
});
