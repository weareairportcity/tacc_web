import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { getRegistration } from "./registrations";
import { CampError } from "./types";

/**
 * Rating after a full payment: the whole registration (form, groups, paying),
 * not only checkout. Named separately from after-camp camp_feedback so a 1–5
 * on Commune isn't mixed with "how was camp".
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

export type PayExperienceRow = {
  registration_id: string;
  full_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

export type PayExperienceSummary = {
  answers: number;
  average: number | null;
  /** How many gave each rating, 1 to 5. */
  ratings: number[];
};

const n = (v: unknown) => Number(v) || 0;

/** Checkout ratings for a camp, for the coordinator Feedback page. */
export async function payExperienceSummary(campId: string): Promise<PayExperienceSummary> {
  const rows = await query<{ rating: number; n: number }>(
    "app",
    "SELECT rating, COUNT(*) AS n FROM camp_pay_experience WHERE camp_id = ? GROUP BY rating",
    [checkId(campId, "camp")],
  );
  const by = [1, 2, 3, 4, 5].map((star) => n(rows.find((r) => n(r.rating) === star)?.n));
  const answers = by.reduce((a, b) => a + b, 0);
  return {
    answers,
    average: answers ? by.reduce((sum, count, i) => sum + count * (i + 1), 0) / answers : null,
    ratings: by,
  };
}

/**
 * Newest first. Coordinators see names (unlike after-camp feedback) so they
 * can follow up on a 1 or 2.
 */
export async function listPayExperience(campId: string, limit = 500): Promise<PayExperienceRow[]> {
  const rows = await query<PayExperienceRow>(
    "app",
    `SELECT e.registration_id, r.full_name, e.rating, e.comment, e.created_at
     FROM camp_pay_experience e
     JOIN camp_registrations r ON r.id = e.registration_id
     WHERE e.camp_id = ?
     ORDER BY e.created_at DESC
     LIMIT ?`,
    [checkId(campId, "camp"), limit],
  );
  return rows.map((r) => ({ ...r, rating: n(r.rating), comment: String(r.comment ?? "") }));
}
