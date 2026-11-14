import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { CampError } from "@/lib/camp/types";
import { hasPayExperience, listPayExperience, payExperienceSummary, ratePayExperience } from "@/lib/camp/pay-experience";
import { openCamp, paidUp, registered } from "./helpers";

describe("pay experience", () => {
  it("saves one rating after a full payment, and a comment if they leave one", async () => {
    const { camp, roomTypeId } = await openCamp();
    const me = await paidUp(camp, roomTypeId);
    expect(await hasPayExperience(me.id)).toBe(false);
    await ratePayExperience(me.id, 2, "  MoMo was slow  ");
    expect(await hasPayExperience(me.id)).toBe(true);
    const [row] = await query<{ rating: number; comment: string }>(
      "app",
      "SELECT rating, comment FROM camp_pay_experience WHERE registration_id = ?",
      [me.id],
    );
    expect(row).toEqual({ rating: 2, comment: "MoMo was slow" });
    await expect(ratePayExperience(me.id, 5)).rejects.toThrow(CampError);
  });

  it("waits until they're fully paid, and doesn't need a comment", async () => {
    const { id } = await registered();
    await expect(ratePayExperience(id, 5)).rejects.toThrow("Rate us after you've paid in full.");
    expect(await hasPayExperience(id)).toBe(false);
    const { camp, roomTypeId } = await openCamp();
    const me = await paidUp(camp, roomTypeId, { full_name: "Kofi Boateng" });
    await ratePayExperience(me.id, 5);
    const [row] = await query<{ rating: number; comment: string }>(
      "app",
      "SELECT rating, comment FROM camp_pay_experience WHERE registration_id = ?",
      [me.id],
    );
    expect(row).toEqual({ rating: 5, comment: "" });
  });

  it("summarises checkout ratings for coordinators, with names on comments", async () => {
    const { camp, roomTypeId } = await openCamp();
    const ama = await paidUp(camp, roomTypeId, { full_name: "Ama Mensah" });
    const kofi = await paidUp(camp, roomTypeId, { full_name: "Kofi Boateng" });
    await ratePayExperience(ama.id, 2, "MoMo was slow");
    await ratePayExperience(kofi.id, 5);
    const summary = await payExperienceSummary(camp.id);
    expect(summary.answers).toBe(2);
    expect(summary.average).toBe(3.5);
    expect(summary.ratings).toEqual([0, 1, 0, 0, 1]);
    const rows = await listPayExperience(camp.id);
    expect(rows.map((r) => r.full_name)).toEqual(["Kofi Boateng", "Ama Mensah"]);
    expect(rows[1]).toMatchObject({ full_name: "Ama Mensah", rating: 2, comment: "MoMo was slow" });
  });
});
