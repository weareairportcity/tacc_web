import { describe, expect, it } from "vitest";
import { post, query } from "@/lib/cf";
import { arrivalCounts, checkIn, findArrivals, undoCheckIn } from "@/lib/camp/checkin";
import { cancelMine, deleteMyDetails, getPrivateDetails, setAnyRoom, updateProfile } from "@/lib/camp/profile";
import { AlreadyRegistered, getRegistration, register } from "@/lib/camp/registrations";
import { listHistory, listPeople, parsePeopleFilters, peopleFacets } from "@/lib/camp/reports";
import { makeToken, readToken } from "@/lib/camp/tokens";
import { deleteView, listViews, saveView } from "@/lib/camp/views";
import { createGroup } from "@/lib/camp/groups";
import { assignGroup, assignPerson, unassignMany } from "@/lib/camp/assignments";
import { createRoom } from "@/lib/camp/rooms";
import { CampError } from "@/lib/camp/types";
import { ACTOR, attendee, openCamp, paidUp, paidWithPayment } from "./helpers";

// Commune v2: what attendees manage themselves, check-in, the People filters,
// History and saved views. Payments and requests are in payments.db.test.ts.

describe("registering", () => {
  it("keeps the T-shirt size and sends a repeat phone to sign in", async () => {
    const { camp, roomTypeId } = await openCamp();
    const input = attendee(roomTypeId, { shirt_size: "3XL" });
    const { id } = await register(camp, input);
    expect((await getRegistration(id))?.shirt_size).toBe("3XL");
    await expect(register(camp, input)).rejects.toBeInstanceOf(AlreadyRegistered);
    await expect(register(camp, attendee(roomTypeId, { shirt_size: "5XL" as "4XL" }))).rejects.toThrow("T-shirt size");
  });
});

describe("profile", () => {
  it("saves details, keeps emergency and health notes out of the registration and the log", async () => {
    const { camp, roomTypeId } = await openCamp();
    const { id } = await register(camp, attendee(roomTypeId));
    await updateProfile(`attendee:${id}`, id, {
      full_name: "Ama  Owusu", email: "AMA@x.com", shirt_size: "L", emergency_name: "Grace", emergency_phone: "024 555 0101", health_notes: "Asthma",
    });
    expect(await getRegistration(id)).toMatchObject({ full_name: "Ama Owusu", email: "ama@x.com", shirt_size: "L" });
    expect(await getPrivateDetails(id)).toEqual({ emergency_name: "Grace", emergency_phone: "233245550101", health_notes: "Asthma" });
    expect(await getRegistration(id)).not.toHaveProperty("health_notes");
    const log = await query<{ after_json: string | null }>("app", "SELECT after_json FROM camp_audit_log WHERE entity_id = ? AND action = 'registration.profile'", [id]);
    expect(log).toEqual([{ after_json: null }]);
    await expect(updateProfile(`attendee:${id}`, id, { full_name: "A", email: "x", shirt_size: "", emergency_name: "", emergency_phone: "12", health_notes: "" }))
      .rejects.toThrow(CampError);
  });

  it("'any room' only before joining a group", async () => {
    const { camp, roomTypeId } = await openCamp();
    const me = await paidUp(camp, roomTypeId);
    await setAnyRoom(me, true);
    expect((await getRegistration(me.id))?.any_room).toBe(1);
    await setAnyRoom(me, false);
    await createGroup((await getRegistration(me.id))!);
    await expect(setAnyRoom(me, true)).rejects.toThrow("Leave your roommate group");
  });

  it("cancelling without paying asks for no refund; deleting wipes details but keeps the row", async () => {
    const { camp, roomTypeId } = await openCamp();
    const { id } = await register(camp, attendee(roomTypeId));
    const me = (await getRegistration(id))!;
    expect(await cancelMine(me, "", false)).toEqual({ refundRequested: false });
    await deleteMyDetails((await getRegistration(id))!);
    const after = (await getRegistration(id))!;
    expect(after).toMatchObject({ full_name: "Deleted", email: "", status: "cancelled" });
    expect(after.phone).toBe(`deleted:${id}`);
    // The phone is free to register again.
    await register(camp, attendee(roomTypeId, { phone: me.phone }));
  });
});

describe("check-in", () => {
  it("signs the pass, checks in once, undoes, and counts", async () => {
    const { camp, roomTypeId } = await openCamp();
    const me = await paidUp(camp, roomTypeId, { full_name: "Kojo Badu" });
    const token = makeToken("checkin", me.id);
    expect(readToken("checkin", token)).toBe(me.id);
    expect(readToken("pay", token)).toBeNull();
    expect(readToken("checkin", token.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull();

    expect((await checkIn(ACTOR, camp.id, me.id)).already).toBe(false);
    expect((await checkIn(ACTOR, camp.id, me.id)).already).toBe(true);
    expect(await arrivalCounts(camp.id)).toEqual({ here: 1, expected: 1 });
    expect((await findArrivals(camp.id, "koj"))[0]?.full_name).toBe("Kojo Badu");
    await undoCheckIn(ACTOR, camp.id, me.id);
    expect(await arrivalCounts(camp.id)).toEqual({ here: 0, expected: 1 });
    const other = await openCamp();
    await expect(checkIn(ACTOR, other.camp.id, me.id)).rejects.toThrow("isn't for this camp");
  });
});

describe("People filters", () => {
  it("counts each option ignoring its own filter, and sorts by latest payment", async () => {
    const { camp, roomTypeId } = await openCamp();
    const a = await paidWithPayment(camp, roomTypeId, { full_name: "Zed First", fellowship: "Qadash" }, 10000);
    await new Promise((r) => setTimeout(r, 5));
    await paidWithPayment(camp, roomTypeId, { full_name: "Abe Second", fellowship: "Qadash" }, 20000);
    await register(camp, attendee(roomTypeId, { full_name: "Cy Third", fellowship: "Qadash" }));
    const filters = parsePeopleFilters({ status: "outstanding", fellowship: "Qadash" });
    const facets = await peopleFacets(camp.id, filters);
    expect(facets.total).toBe(3);
    expect(facets.status).toMatchObject({ partially_paid: 2, registered: 1, outstanding: 3 });
    expect(facets.fellowship.Qadash).toBe(3);
    expect(facets.outstanding).toBe(60000 * 3 - 30000);

    // Latest first: by last payment, else when they registered (these test payments carry no paid_at).
    expect((await listPeople(camp.id, filters)).map((p) => p.full_name)).toEqual(["Cy Third", "Abe Second", "Zed First"]);
    await query("app", "UPDATE camp_payments SET paid_at = ? WHERE registration_id = ?", [new Date(Date.now() + 60_000).toISOString(), a.id]);
    expect((await listPeople(camp.id, filters))[0].full_name).toBe("Zed First");
    expect((await listPeople(camp.id, { ...filters, sort: "name" })).map((p) => p.full_name)).toEqual(["Abe Second", "Cy Third", "Zed First"]);
    expect((await listPeople(camp.id, { ...filters, sort: "outstanding" }))[0].full_name).toBe("Cy Third");
  });
});

describe("assign and undo", () => {
  it("returns who was placed so a placement can be undone", async () => {
    const { camp, roomTypeId } = await openCamp();
    const room = await createRoom(ACTOR, camp.id, { label: "A1", room_type_id: roomTypeId, gender: "female", capacity: 4 });
    const owner = await paidUp(camp, roomTypeId);
    const group = await createGroup(owner);
    const placed = await assignGroup(ACTOR, room, group);
    expect(placed.placed).toEqual([owner.id]);
    await unassignMany(ACTOR, placed.placed);
    const solo = await paidUp(camp, roomTypeId);
    expect((await assignPerson(ACTOR, room, solo.id)).room).toBe("A1");
  });
});

describe("History", () => {
  it("filters by kind and names the person", async () => {
    const { camp, roomTypeId } = await openCamp();
    const me = await paidUp(camp, roomTypeId, { full_name: "Efua Log" });
    await checkIn(ACTOR, camp.id, me.id);
    const people = await listHistory(camp.id, { kind: "people" });
    expect(people.find((e) => e.action === "registration.check_in")?.person).toBe("Efua Log");
    expect(await listHistory(camp.id, { kind: "money" })).toEqual([]);
    expect((await listHistory(camp.id, { who: ACTOR })).every((e) => e.actor === ACTOR)).toBe(true);
  });
});

describe("saved views", () => {
  it("keeps only filter keys, one name per coordinator", async () => {
    const { camp } = await openCamp();
    await saveView(camp.id, ACTOR, "Zion owing", "?fellowship=Zion&status=outstanding&evil=1");
    await saveView(camp.id, ACTOR, "Zion owing", "fellowship=Zion");
    const views = await listViews(camp.id, ACTOR);
    expect(views).toHaveLength(1);
    expect(views[0].query).toBe("fellowship=Zion");
    expect(await listViews(camp.id, "other@test.local")).toEqual([]);
    await deleteView(ACTOR, views[0].id);
    expect(await listViews(camp.id, ACTOR)).toEqual([]);
  });
});

describe("evening summary", () => {
  it("is claimed once per camp per day", async () => {
    await query("app", "INSERT INTO camp_staff (email, role, phone) VALUES ('summary@test.local', 'coordinator', '233240000000') ON CONFLICT DO NOTHING");
    const { camp } = await openCamp();
    // Other test files make camps meanwhile, so only this camp is checked.
    const at = "2031-01-02T19:00:00Z";
    await post("/v1/admin/camp/summary", { at });
    const again = await post<{ sent: Record<string, number> }>("/v1/admin/camp/summary", { at });
    expect(again.sent).not.toHaveProperty(camp.name);
    const rows = await query<{ n: number }>("app", "SELECT COUNT(*) AS n FROM camp_daily_summaries WHERE day = '2031-01-02' AND camp_id = ?", [camp.id]);
    expect(rows[0].n).toBe(1);
  });
});

