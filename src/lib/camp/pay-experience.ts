import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { getRegistration } from "./registrations";
import { CampError } from "./types";

/**
 * Checkout rating after a full payment. Named separately from after-camp
 * camp_feedback so a 1–5 on expressPay isn't mixed with "how was camp".
 */

const COMMENT = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);

export async function hasPayExperience(registrationId: string): Promise<boolean> {
  const [row] = await query<{ n: number }>(
    "app",
    "SELECT 1 AS n FROM camp_pay_experience WHERE registration_id = ?",
    [checkId(registrationId, "registration")],
  );
  return !!row;
}

export async function ratePayExperience(registrationId: string, rating: number, comment = "") {
  const stars = Math.round(Number(rating));
  if (!(stars >= 1 && stars <= 5)) throw new CampError("Choose 1 to 5 stars.");
  const note = COMMENT(comment);
  const me = await getRegistration(registrationId);
  if (!me) throw new CampError("Unknown registration.");
  if (me.paid_pesewas < me.price_pesewas) throw new CampError("Rate us after you've paid in full.");
  if (await hasPayExperience(me.id)) throw new CampError("You've already rated this.");
  await batch("app", [
    {
      sql: "INSERT INTO camp_pay_experience (registration_id, camp_id, rating, comment) VALUES (?, ?, ?, ?)",
      params: [me.id, me.camp_id, stars, note],
    },
    auditStatement({
      actor: `attendee:${me.id}`,
      campId: me.camp_id,
      action: "pay.experience",
      entity: "registration",
      entityId: me.id,
      after: { rating: stars, commented: note.length > 0 },
    }),
  ]);
}
