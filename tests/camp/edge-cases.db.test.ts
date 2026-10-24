import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { changeRoomType, listRefunds, recordRefund } from "@/lib/camp/adjustments";
import { assignGroup, assignPerson, getMyRoom } from "@/lib/camp/assignments";
import { createGroup, getGroupFor, joinByCode, setLocked } from "@/lib/camp/groups";
import { cancelRegistration, getRegistration } from "@/lib/camp/registrations";
import { getDashboard } from "@/lib/camp/reports";
import { listRoomSmsPending, sendRoomSms } from "@/lib/camp/room-sms";
import { createRoom, createRoomType } from "@/lib/camp/rooms";
import type { Registration } from "@/lib/camp/types";
import { ACTOR, openCamp, paidWithPayment } from "./helpers";

// Phase 7: the spec's edge cases that earlier phases left open (refunds,
// room-type changes), the dashboard's group-size warning, and room texts.
// The spec's other edge cases are covered where they were built:
//   duplicate / missing / mismatched webhooks, overpayment  → payments.db.test.ts
//   registering twice                                         → registrations.db.test.ts
//   last group place, locked groups, member cancels           → groups.db.test.ts
//   two coordinators, room deleted, capacity below occupancy  → assignments.db.test.ts
//   underpaid at the due date, unmatched at the deadline      → reports.db.test.ts

async function campWithTypes() {
  const { camp, roomTypeId: hostel } = await openCamp(); // GHS 600, 4 beds
  const suite = await createRoomType(ACTOR, camp.id, { name: "Suite", price_pesewas: 90000, capacity: 2 });
  const dorm = await createRoomType(ACTOR, camp.id, { name: "Dorm", price_pesewas: 40000, capacity: 8 });
  return { camp, hostel, suite, dorm };
}

describe("recording a refund", () => {
  it("lowers what was paid, keeps the payment, and is audited", async () => {
    const { camp, hostel } = await campWithTypes();
    const ama = await paidWithPayment(camp, hostel);
    expect(await recordRefund(ACTOR, ama.id, { amount_pesewas: 10000, reference: "RF-1", note: "overcharged" })).toEqual({
      warning: null,
    });
    expect(await getRegistration(ama.id)).toMatchObject({ paid_pesewas: 50000, status: "partially_paid" });
    expect(await listRefunds(ama.id)).toMatchObject([{ amount_pesewas: 10000, reference: "RF-1", recorded_by: ACTOR }]);
    const [{ n }] = await query<{ n: number }>("app", "SELECT COUNT(*) AS n FROM camp_payments WHERE registration_id = ? AND status = 'success'", [ama.id]);
    expect(n).toBe(1);
    const [entry] = await query<{ action: string }>("app", "SELECT action FROM camp_audit_log WHERE entity_id = ? AND action = 'registration.refund'", [ama.id]);
    expect(entry).toBeTruthy();
  });

  it("can't be more than was paid, even when bypassing the code or racing", async () => {
    const { camp, hostel } = await campWithTypes();
    const ama = await paidWithPayment(camp, hostel, {}, 30000);
    await expect(recordRefund(ACTOR, ama.id, { amount_pesewas: 30001, reference: "", note: "" })).rejects.toThrow("can't be more");
    const twice = await Promise.allSettled([
      recordRefund(ACTOR, ama.id, { amount_pesewas: 20000, reference: "A", note: "" }),
      recordRefund(ACTOR, ama.id, { amount_pesewas: 20000, reference: "B", note: "" }),
    ]);
    expect(twice.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getRegistration(ama.id))!.paid_pesewas).toBe(10000);
    await expect(
      query("app", "INSERT INTO camp_refunds (id, registration_id, amount_pesewas, recorded_by) VALUES (?, ?, 20000, 'raw')", [
        crypto.randomUUID(),
        ama.id,
      ]),
    ).rejects.toThrow();
    await expect(query("app", "UPDATE camp_refunds SET amount_pesewas = 1 WHERE registration_id = ?", [ama.id])).rejects.toThrow();
  });

  it("warns when someone is no longer fully paid but keeps a bed", async () => {
    const { camp, hostel } = await campWithTypes();
    const room = await createRoom(ACTOR, camp.id, { label: "A1", room_type_id: hostel, gender: "female", capacity: 4 });
    const ama = await paidWithPayment(camp, hostel);
    await assignPerson(ACTOR, room, ama.id);
    const { warning } = await recordRefund(ACTOR, ama.id, { amount_pesewas: 100, reference: "", note: "" });
    expect(warning).toMatch(/no longer fully paid but still has room A1/);
  });

  it("on a cancelled registration moves money from 'to refund' to 'refunded', and the balance can be paid again", async () => {
    const { camp, hostel } = await campWithTypes();
    const esi = await paidWithPayment(camp, hostel);
    await cancelRegistration(ACTOR, esi.id);
    expect((await getDashboard(camp.id)).money).toMatchObject({ paidByCancelled: 60000, refunded: 0 });
    await recordRefund(ACTOR, esi.id, { amount_pesewas: 60000, reference: "RF-9", note: "cancelled" });
    expect(await getRegistration(esi.id)).toMatchObject({ status: "cancelled", paid_pesewas: 0 });
    expect((await getDashboard(camp.id)).money).toMatchObject({ paidByCancelled: 0, refunded: 60000 });

    // Someone refunded in part can pay again up to the price: the overpayment rule counts refunds.
    const kofi = await paidWithPayment(camp, hostel);
    await recordRefund(ACTOR, kofi.id, { amount_pesewas: 20000, reference: "", note: "" });
    const again = crypto.randomUUID();
    await query(
      "app",
      `INSERT INTO camp_payments (id, registration_id, reference, amount_pesewas, fee_pesewas, charged_pesewas)
       VALUES (?, ?, ?, 20000, 0, 20000)`,
      [again, kofi.id, `TEST-${again}`],
    );
    await query("app", "UPDATE camp_payments SET status = 'success' WHERE id = ?", [again]);
  });
});

describe("changing someone's room type", () => {
  it("applies the new price and recomputes status", async () => {
    const { camp, hostel, suite, dorm } = await campWithTypes();
    const ama = await paidWithPayment(camp, hostel, {}, 40000);
    expect((await changeRoomType(ACTOR, ama.id, suite)).warning).toBeNull();
    expect(await getRegistration(ama.id)).toMatchObject({ room_type_name: "Suite", price_pesewas: 90000, status: "partially_paid" });
    expect((await changeRoomType(ACTOR, ama.id, dorm)).warning).toMatch(/is now fully paid/);
    expect(await getRegistration(ama.id)).toMatchObject({ price_pesewas: 40000, paid_pesewas: 40000, status: "fully_paid" });
    const [entry] = await query<{ after_json: string }>(
      "app",
      "SELECT after_json FROM camp_audit_log WHERE entity_id = ? AND action = 'registration.room_type_change' ORDER BY id DESC LIMIT 1",
      [ama.id],
    );
    expect(JSON.parse(entry.after_json)).toEqual({ room_type_id: dorm, price_pesewas: 40000 });
  });

  it("is blocked when they've paid more than the new price, until the difference is refunded", async () => {
    const { camp, hostel, dorm } = await campWithTypes();
    const ama = await paidWithPayment(camp, hostel);
    await expect(changeRoomType(ACTOR, ama.id, dorm)).rejects.toThrow("Refund GHS 200.00");
    await recordRefund(ACTOR, ama.id, { amount_pesewas: 20000, reference: "RF", note: "downgrade" });
    await changeRoomType(ACTOR, ama.id, dorm);
    expect(await getRegistration(ama.id)).toMatchObject({ price_pesewas: 40000, paid_pesewas: 40000, status: "fully_paid" });
  });

  it("takes them out of their group and room, even a locked group", async () => {
    const { camp, hostel, suite } = await campWithTypes();
    const room = await createRoom(ACTOR, camp.id, { label: "A1", room_type_id: hostel, gender: "female", capacity: 4 });
    const owner = await paidWithPayment(camp, hostel);
    const ama = await paidWithPayment(camp, hostel);
    const group = await createGroup(owner);
    await joinByCode(ama, (await getGroupFor(owner.id))!.code);
    await setLocked(owner, true);
    await assignGroup(ACTOR, room, group);

    const { warning } = await changeRoomType(ACTOR, ama.id, suite);
    expect(warning).toMatch(/left their roommate group, left room A1, is now partially paid/);
    expect(await getGroupFor(ama.id)).toBeNull();
    expect(await getMyRoom(ama.id)).toBeNull();
    expect((await getGroupFor(owner.id))!.members.map((m) => m.registration_id)).toEqual([owner.id]);
    expect((await getMyRoom(owner.id))?.label).toBe("A1");
  });

  it("isn't possible for a cancelled registration or to the same type", async () => {
    const { camp, hostel, suite } = await campWithTypes();
    const ama = await paidWithPayment(camp, hostel);
    await expect(changeRoomType(ACTOR, ama.id, hostel)).rejects.toThrow("already in Hostel");
    await cancelRegistration(ACTOR, ama.id);
    await expect(changeRoomType(ACTOR, ama.id, suite)).rejects.toThrow("cancelled");
  });
});

describe("the dashboard", () => {
  it("warns when a group needs more beds together than any room has free", async () => {
    const { camp, hostel } = await campWithTypes();
    await createRoom(ACTOR, camp.id, { label: "Small", room_type_id: hostel, gender: "female", capacity: 2 });
    const people: Registration[] = [];
    for (let i = 0; i < 3; i++) people.push(await paidWithPayment(camp, hostel));
    await createGroup(people[0]);
    const code = (await getGroupFor(people[0].id))!.code;
    for (const p of people.slice(1)) await joinByCode(p, code);
    expect((await getDashboard(camp.id)).groupsTooBig).toEqual([
      { code, room_type_name: "Hostel", gender: "female", needs: 3, most_free: 2 },
    ]);
  });
});

describe("texting everyone their room", () => {
  it("sends one text per room, only to people not yet told, and retries failures", async () => {
    const { camp, hostel } = await campWithTypes();
    const a1 = await createRoom(ACTOR, camp.id, { label: "A1", room_type_id: hostel, gender: "female", capacity: 4 });
    const a2 = await createRoom(ACTOR, camp.id, { label: "A2", room_type_id: hostel, gender: "female", capacity: 4 });
    const [ama, efua, esi] = [await paidWithPayment(camp, hostel), await paidWithPayment(camp, hostel), await paidWithPayment(camp, hostel)];
    await assignPerson(ACTOR, a1, ama.id);
    await assignPerson(ACTOR, a1, efua.id);
    await assignPerson(ACTOR, a2, esi.id);

    const sent: { to: string[]; text: string }[] = [];
    const fakeSms = async (to: string | string[], text: string) => {
      sent.push({ to: [to].flat(), text });
      return !text.includes("A2"); // A2's text fails the first time
    };
    expect(await sendRoomSms(ACTOR, camp, "https://example.test", fakeSms)).toEqual({ sent: 2, failedRooms: 1, remaining: 1 });
    expect(sent.find((s) => s.text.includes("A1"))).toMatchObject({ to: [ama.phone, efua.phone] });
    expect(sent[0].text).toContain(`https://example.test/camps/${camp.slug}/me`);

    // Only A2 is retried; then nothing is left.
    sent.length = 0;
    await sendRoomSms(ACTOR, camp, "https://example.test", async (to, text) => (sent.push({ to: [to].flat(), text }), true));
    expect(sent.map((s) => s.to)).toEqual([[esi.phone]]);
    expect(await listRoomSmsPending(camp.id)).toEqual([]);

    // Someone who moves is told again; someone cancelled isn't.
    await query("app", "DELETE FROM camp_room_assignments WHERE registration_id = ?", [efua.id]);
    await assignPerson(ACTOR, a2, efua.id);
    await cancelRegistration(ACTOR, esi.id);
    expect((await listRoomSmsPending(camp.id)).map((p) => [p.registration_id, p.label])).toEqual([[efua.id, "A2"]]);
  });
});
