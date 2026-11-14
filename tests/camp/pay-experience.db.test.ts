import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { CampError } from "@/lib/camp/types";
import { hasPayExperience, ratePayExperience } from "@/lib/camp/pay-experience";
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
});
