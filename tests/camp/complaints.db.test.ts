import { describe, expect, it } from "vitest";
import { createComplaint, listComplaints, listMyComplaints, markComplaintRead, openComplaintCount, resolveComplaint, unreadComplaints } from "@/lib/camp/complaints";
import { listHistory } from "@/lib/camp/reports";
import { getRegistration, register } from "@/lib/camp/registrations";
import { ACTOR, attendee, openCamp } from "./helpers";

// Complaints: reported in words (and a photo), seen by coordinators and the person's leaders, resolved once.

async function person(camp: Awaited<ReturnType<typeof openCamp>>["camp"], roomTypeId: string, name: string, fellowship: string) {
  const { id } = await register(camp, attendee(roomTypeId, { full_name: name, fellowship }));
  return (await getRegistration(id))!;
}

describe("complaints", () => {
  it("are saved with a time, listed for coordinators, and only a leader's own people's for a leader", async () => {
    const { camp, roomTypeId } = await openCamp();
    const ama = await person(camp, roomTypeId, "Ama Mensah", "Qadash");
    const kofi = await person(camp, roomTypeId, "Kofi Boateng", "Chosen");
    await createComplaint(ama, "The tap in our room is broken", "https://media.example/complaint-1.jpg");
    await createComplaint(kofi, "Too noisy at night");

    const all = await listComplaints(camp.id);
    expect(all.map((c) => c.full_name).sort()).toEqual(["Ama Mensah", "Kofi Boateng"]);
    expect(all.find((c) => c.full_name === "Ama Mensah")).toMatchObject({ status: "open", photo_url: "https://media.example/complaint-1.jpg" });
    expect(all[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await listComplaints(camp.id, { kind: "fellowship", value: "Qadash" })).map((c) => c.full_name)).toEqual(["Ama Mensah"]);
    expect((await listComplaints(camp.id, { kind: "pfcc", value: "PFCC 1" })).map((c) => c.full_name)).toEqual(["Kofi Boateng"]);
    expect(await openComplaintCount(camp.id)).toBe(2);
    expect((await listMyComplaints(ama.id)).map((c) => c.body)).toEqual(["The tap in our room is broken"]);
  });

  it("can be resolved once, by a coordinator or the leader of that person, and show in History", async () => {
    const { camp, roomTypeId } = await openCamp();
    const ama = await person(camp, roomTypeId, "Ama Mensah", "Qadash");
    const kofi = await person(camp, roomTypeId, "Kofi Boateng", "Chosen");
    const a = await createComplaint(ama, "The tap in our room is broken");
    const k = await createComplaint(kofi, "Too noisy at night");

    // A leader can't touch someone else's.
    await expect(resolveComplaint("leader:fellowship:Qadash", k, "", { kind: "fellowship", value: "Qadash" })).rejects.toThrow("Unknown complaint");
    await resolveComplaint("leader:fellowship:Qadash", a, "Plumber came", { kind: "fellowship", value: "Qadash" });
    await resolveComplaint(ACTOR, k);
    await expect(resolveComplaint(ACTOR, a)).rejects.toThrow("already resolved");

    const done = await listComplaints(camp.id, { kind: "all" }, "resolved");
    expect(done).toHaveLength(2);
    expect(done.find((c) => c.id === a)).toMatchObject({ resolved_by: "leader:fellowship:Qadash", resolution_note: "Plumber came" });
    expect(done.find((c) => c.id === a)!.resolved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await openComplaintCount(camp.id)).toBe(0);
    expect((await listHistory(camp.id, {})).map((e) => e.action)).toEqual(expect.arrayContaining(["complaint.create", "complaint.resolve"]));
  });

  it("need words, and a few an hour at most", async () => {
    const { camp, roomTypeId } = await openCamp();
    const ama = await person(camp, roomTypeId, "Ama Mensah", "Qadash");
    await expect(createComplaint(ama, "  ")).rejects.toThrow("what the problem is");
    for (let i = 0; i < 5; i++) await createComplaint(ama, `Problem number ${i}`);
    await expect(createComplaint(ama, "One more")).rejects.toThrow("wait a little");
  });

  it("count as unread for each person until they open it, and History says who it was from", async () => {
    const { camp, roomTypeId } = await openCamp();
    const ama = await person(camp, roomTypeId, "Ama Mensah", "Qadash");
    const id = await createComplaint(ama, "The tap in our room is broken");
    expect(await unreadComplaints(camp.id, ACTOR)).toBe(1);
    expect((await listComplaints(camp.id, { kind: "all" }, undefined, ACTOR))[0].unread).toBe(true);

    await markComplaintRead(ACTOR, id);
    expect(await unreadComplaints(camp.id, ACTOR)).toBe(0);
    // Someone else still has it unread, and a leader of another fellowship can't mark it.
    expect(await unreadComplaints(camp.id, "other@test.local")).toBe(1);
    await markComplaintRead("leader:fellowship:Chosen", id, { kind: "fellowship", value: "Chosen" });
    expect(await unreadComplaints(camp.id, "leader:fellowship:Chosen", { kind: "fellowship", value: "Chosen" })).toBe(0);

    await resolveComplaint(ACTOR, id, "Plumber came");
    const entry = (await listHistory(camp.id, {})).find((e) => e.action === "complaint.resolve")!;
    expect([entry.actor, entry.person, entry.note]).toEqual([ACTOR, "Ama Mensah", "(Plumber came)"]);
    expect(await unreadComplaints(camp.id, "other@test.local")).toBe(0);
  });
});
