import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { movePayment } from "@/lib/camp/adjustments";
import { changeFellowship } from "@/lib/camp/fellowship";
import { getRegistration } from "@/lib/camp/registrations";
import { listHistory } from "@/lib/camp/reports";
import { ACTOR, attendee, openCamp, paidWithPayment } from "./helpers";
import { register } from "@/lib/camp/registrations";

// A payment that landed on the wrong person can be moved; both balances follow.

describe("moving a payment", () => {
  it("moves the money, the balances and statuses follow, and it's in History", async () => {
    const { camp, roomTypeId } = await openCamp();
    const ebenezer = await paidWithPayment(camp, roomTypeId, { full_name: "Ebenezer Azu" });
    const { id: vincentId } = await register(camp, attendee(roomTypeId, { full_name: "Afordanyi Kofi Vincent" }));
    const [pay] = await query<{ id: string }>("app", "SELECT id FROM camp_payments WHERE registration_id = ?", [ebenezer.id]);

    await movePayment(ACTOR, pay.id, vincentId);

    const [e, v] = await Promise.all([getRegistration(ebenezer.id), getRegistration(vincentId)]);
    expect(e!.paid_pesewas).toBe(0);
    expect(e!.status).toBe("registered");
    expect(v!.paid_pesewas).toBe(v!.price_pesewas);
    expect(v!.status).toBe("fully_paid");
    expect((await listHistory(camp.id, {})).map((x) => x.action)).toContain("payment.move");
  });

  it("refuses to overpay the other person or move onto the same person", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await paidWithPayment(camp, roomTypeId, { full_name: "Ama One" });
    const b = await paidWithPayment(camp, roomTypeId, { full_name: "Kofi Two" });
    const [pay] = await query<{ id: string }>("app", "SELECT id FROM camp_payments WHERE registration_id = ?", [a.id]);
    await expect(movePayment(ACTOR, pay.id, b.id)).rejects.toThrow("would be too much");
    await expect(movePayment(ACTOR, pay.id, a.id)).rejects.toThrow("already on this person");
  });
});

describe("changing fellowship", () => {
  it("updates fellowship and PFCC, and is in History", async () => {
    const { camp, roomTypeId } = await openCamp();
    const p = await paidWithPayment(camp, roomTypeId, { full_name: "Esi Anyen", fellowship: "Chosen" });
    await changeFellowship(`attendee:${p.id}`, p.id, "Radah");
    const after = (await getRegistration(p.id))!;
    expect([after.fellowship, after.pfcc]).toEqual(["Radah", "PFCC 2"]);
    await expect(changeFellowship(`attendee:${p.id}`, p.id, "Radah")).rejects.toThrow("already your fellowship");
    await expect(changeFellowship(`attendee:${p.id}`, p.id, "Nonsense")).rejects.toThrow("Choose a fellowship");
    expect((await listHistory(camp.id, {})).map((x) => x.action)).toContain("registration.fellowship_change");
  });
});
