import { describe, expect, it } from "vitest";
import { post, query } from "@/lib/cf";
import { arrivalCounts, findArrivals, markScan, recentArrivals, undoScan } from "@/lib/camp/checkin";
import { leaderActor, leaderName, leaderScopes, newLeaderCode, turnOffLeaderCode } from "@/lib/camp/leaders";
import { listHistory } from "@/lib/camp/reports";
import { CampError } from "@/lib/camp/types";
import { ACTOR, openCamp, paidUp, paidWithPayment } from "./helpers";

// Leader codes (the Worker makes and checks them) and what a leader may do:
// scan check-ins and T-shirts for their own fellowship or PFCC only, logged.

const check = (code: string) => post<{ id: string; scope_kind: string; scope_value: string }>("/v1/admin/camp/leader-code/check", { code });

describe("leader codes", () => {
  it("one per fellowship and PFCC: a new code turns the old one off", async () => {
    expect(leaderScopes().filter((s) => s.kind === "pfcc").map((s) => s.value)).toEqual(["PFCC 1", "PFCC 2", "Children's Church"]);
    const first = await newLeaderCode(ACTOR, "fellowship", "Qadash");
    expect(first.code).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
    // Any case, dashes or spaces.
    expect(await check(first.code.toLowerCase().replace("-", " "))).toMatchObject({ scope_kind: "fellowship", scope_value: "Qadash" });

    const second = await newLeaderCode(ACTOR, "fellowship", "Qadash");
    await expect(check(first.code)).rejects.toThrow();
    expect(await check(second.code)).toMatchObject({ id: second.id });

    await turnOffLeaderCode(ACTOR, second.id);
    await expect(check(second.code)).rejects.toThrow();
    await expect(newLeaderCode(ACTOR, "fellowship", "Not A Fellowship")).rejects.toThrow(CampError);
  });

  it("only a hash of the code is stored", async () => {
    const { id, code } = await newLeaderCode(ACTOR, "pfcc", "PFCC 1");
    const [row] = await query<Record<string, string>>("app", "SELECT * FROM camp_leader_codes WHERE id = ?", [id]);
    expect(JSON.stringify(row)).not.toContain(code.replace("-", ""));
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("names leaders in History", () => {
    expect(leaderName(leaderActor("fellowship", "Qadash"))).toBe("Qadash leader");
    expect(leaderName("ama@test.local")).toBeNull();
  });
});

describe("leaders scanning", () => {
  const qadash = { kind: "fellowship" as const, value: "Qadash" };

  it("check in and give T-shirts to their own people only, logged as the leader", async () => {
    const { camp, roomTypeId } = await openCamp();
    const mine = await paidUp(camp, roomTypeId, { full_name: "Ama Qadash", fellowship: "Qadash", shirt_size: "L" });
    const other = await paidUp(camp, roomTypeId, { full_name: "Esi Chosen", fellowship: "Chosen" });
    const actor = leaderActor("fellowship", "Qadash");

    expect((await markScan(actor, camp.id, mine.id, "checkin", qadash)).already).toBe(false);
    await expect(markScan(actor, camp.id, other.id, "checkin", qadash)).rejects.toThrow("isn't in Qadash");
    const shirt = await markScan(actor, camp.id, mine.id, "shirt", qadash);
    expect(shirt.person.shirt_size).toBe("L");
    expect((await markScan(actor, camp.id, mine.id, "shirt", qadash)).already).toBe(true);

    expect(await arrivalCounts(camp.id, qadash)).toMatchObject({ here: 1, expected: 1, shirts: 1, sizes: [{ size: "L", given: 1, total: 1 }] });
    expect((await arrivalCounts(camp.id)).expected).toBe(2);
    expect((await findArrivals(camp.id, "esi", qadash)).length).toBe(0);
    expect((await recentArrivals(camp.id, "shirt", qadash)).map((p) => p.full_name)).toEqual(["Ama Qadash"]);

    const log = (await listHistory(camp.id, {})).filter((e) => e.actor === actor).map((e) => e.action);
    expect(log).toEqual(expect.arrayContaining(["registration.check_in", "registration.shirt_given"]));
    await undoScan(actor, camp.id, mine.id, "shirt", qadash);
    expect((await arrivalCounts(camp.id, qadash)).shirts).toBe(0);
  });

  it("never see health notes or roommates", async () => {
    const { camp, roomTypeId } = await openCamp();
    const mine = await paidWithPayment(camp, roomTypeId, { fellowship: "Qadash" });
    await query("app", "UPDATE camp_registrations SET health_notes = 'Asthma' WHERE id = ?", [mine.id]);
    const seen = (await markScan(leaderActor("fellowship", "Qadash"), camp.id, mine.id, "checkin", qadash)).person;
    expect(seen.health_notes).toBe("");
    expect(seen.roommates).toBeNull();
    const coordinator = (await markScan(ACTOR, camp.id, mine.id, "checkin")).person;
    expect(coordinator.health_notes).toBe("Asthma");
  });
});
