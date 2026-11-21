import { describe, expect, it } from "vitest";
import { cancelRegistration, register } from "@/lib/camp/registrations";
import { getCampSummary, summaryCsv } from "@/lib/camp/summary";
import { summaryPdf } from "@/lib/camp/summary-pdf";
import { ACTOR, attendee, openCamp, paidUp } from "./helpers";

describe("camp summary", () => {
  it("ranks PFCC, group and fellowship by people, and leaves cancelled out", async () => {
    const { camp, roomTypeId } = await openCamp();
    await paidUp(camp, roomTypeId, { full_name: "Ama Qadash", fellowship: "Qadash" });
    await paidUp(camp, roomTypeId, { full_name: "Fafa Qadash", fellowship: "Qadash" });
    await register(camp, attendee(roomTypeId, { full_name: "Kofi Chosen", fellowship: "Chosen", gender: "male" }));
    const esi = await paidUp(camp, roomTypeId, { full_name: "Esi Chosen", fellowship: "Chosen" });
    await cancelRegistration(ACTOR, esi.id);

    const printedAt = "2026-11-21T19:14:00.000Z";
    const s = await getCampSummary(camp, "ama.mensah@church.test", printedAt);

    expect(s.overview.people).toBe(3);
    expect(s.overview.fully_paid).toBe(2);
    expect(s.overview.not_paid).toBe(1);
    expect(s.overview.cancelled).toBe(1);
    expect(s.overview.expected).toBe(180000);
    expect(s.overview.collected).toBe(120000);
    expect(s.overview.outstanding).toBe(60000);

    expect(s.fellowships.map((r) => r.name)).toEqual(["Qadash", "Chosen"]);
    expect(s.fellowships[0]).toMatchObject({ rank: 1, people: 2, fully_paid: 2, outstanding: 0, pfcc: "PFCC 2", group: "Group 3" });
    expect(s.fellowships[1]).toMatchObject({ rank: 2, people: 1, not_paid: 1, outstanding: 60000, pfcc: "PFCC 1", group: "Group 1" });

    expect(s.pfccs.map((r) => r.name)).toEqual(["PFCC 2", "PFCC 1"]);
    expect(s.groups.map((r) => r.name)).toEqual(["Group 3", "Group 1"]);

    expect(s.rooms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ room_type_name: "Hostel", gender: "female", people: 2, fully_paid: 2 }),
        expect.objectContaining({ room_type_name: "Hostel", gender: "male", people: 1, fully_paid: 0, outstanding: 60000 }),
      ]),
    );

    const csv = summaryCsv(s);
    expect(csv).toContain("Printed by");
    expect(csv).toContain("ama.mensah@church.test");
    expect(csv).toContain("21 November 2026, 19:14");
    expect(csv).toContain("Qadash");
    expect(csv).not.toContain("Esi Chosen");
    expect(csv).not.toMatch(/Placed|Waiting|today/i);

    const pdf = Buffer.from(await summaryPdf(s)).toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    for (const part of [camp.name, "Camp summary", "Printed by ama.mensah@church.test", "Qadash", "PFCC 2", "Group 3", "Hostel"]) {
      expect(pdf).toContain(part);
    }
  });

  it("does not count a cancelled-only room type as a room row", async () => {
    const { camp, roomTypeId } = await openCamp();
    const esi = await paidUp(camp, roomTypeId, { full_name: "Esi Chosen", fellowship: "Chosen" });
    await cancelRegistration(ACTOR, esi.id);
    const s = await getCampSummary(camp, "coord@test.local");
    expect(s.rooms).toEqual([]);
    expect(s.fellowships).toEqual([]);
  });
});
