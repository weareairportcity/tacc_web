import { describe, expect, it } from "vitest";
import { query } from "@/lib/cf";
import { getCamp, setCampPhoto } from "@/lib/camp/camps";
import type { CampPhoto } from "@/lib/camp/types";
import { ACTOR, openCamp } from "./helpers";

const MEDIA = "https://media.theairportcitychurch.com/camps/test";

describe("camp logo, banner and venue photo", () => {
  it("start empty, then each can be set with a credit, audited", async () => {
    const { camp } = await openCamp();
    expect(camp).toMatchObject({ logo_url: "", banner_url: "", venue_photo_url: "" });
    await setCampPhoto(ACTOR, camp.id, "logo", `${MEDIA}-logo.png`, "");
    await setCampPhoto(ACTOR, camp.id, "banner", `${MEDIA}-banner.jpg`, "  Seedeblay,   CC BY-SA 4.0 ");
    await setCampPhoto(ACTOR, camp.id, "venue_photo", `${MEDIA}-venue.jpg`, "Seedeblay");
    expect(await getCamp(camp.id)).toMatchObject({
      logo_url: `${MEDIA}-logo.png`,
      banner_url: `${MEDIA}-banner.jpg`,
      banner_credit: "Seedeblay, CC BY-SA 4.0",
      venue_photo_credit: "Seedeblay",
    });
    const [{ n }] = await query<{ n: number }>(
      "app",
      "SELECT count(*) AS n FROM camp_audit_log WHERE camp_id = ? AND action = 'camp.photo'",
      [camp.id],
    );
    expect(n).toBe(3);
  });

  it("removing a photo clears its credit too", async () => {
    const { camp } = await openCamp();
    await setCampPhoto(ACTOR, camp.id, "banner", `${MEDIA}-b.jpg`, "Someone");
    await setCampPhoto(ACTOR, camp.id, "banner", "", "ignored");
    expect(await getCamp(camp.id)).toMatchObject({ banner_url: "", banner_credit: "" });
  });

  it("only takes images from the church media host", async () => {
    const { camp } = await openCamp();
    await expect(setCampPhoto(ACTOR, camp.id, "logo", "https://example.com/x.png", "")).rejects.toThrow("Upload the photo here");
    await expect(setCampPhoto(ACTOR, camp.id, "logo", "javascript:alert(1)", "")).rejects.toThrow();
    await expect(setCampPhoto(ACTOR, camp.id, "name" as CampPhoto, `${MEDIA}.png`, "")).rejects.toThrow("Unknown photo");
  });
});
