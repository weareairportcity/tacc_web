import { randomUUID } from "node:crypto";
import { batch, query } from "@/lib/cf";
import { COMMUNE_SENDER, sendSMS } from "@/lib/mnotify";
import { auditStatement } from "./audit";
import { checkId } from "./camps";
import { todayInGhana } from "./registrations";
import { makeToken, readToken } from "./tokens";
import { CampError, type Camp } from "./types";

/**
 * After camp: a coordinator texts everyone who arrived a thank-you with their
 * own feedback link, and reads the answers. Answers are anonymous:
 * camp_feedback has no registration id. camp_feedback_invites only says who
 * was texted and who has answered, so nobody gets two texts or answers twice.
 */

export const MAX_PER_SEND = 250;
const PARALLEL = 5;
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/** Feedback opens on the camp's last day. */
export const feedbackOpen = (camp: Pick<Camp, "ends_on">, today = todayInGhana()) => today >= camp.ends_on;

export const feedbackLink = (origin: string, camp: Pick<Camp, "slug">, registrationId: string) =>
  `${origin}/camps/${camp.slug}/feedback/${makeToken("feedback", registrationId)}`;

export const thanksText = (camp: Pick<Camp, "name">, firstName: string, link: string) =>
  `Hi ${firstName}, thank you for coming to ${camp.name}! How was it? 2 minutes, no name needed: ${link} - The Airport City Church`;

type Pending = { id: string; full_name: string; phone: string };

/** Arrived, not cancelled, can be texted, and not yet texted or answered. */
export function listThanksPending(campId: string): Promise<Pending[]> {
  return query<Pending>(
    "app",
    `SELECT r.id, r.full_name, r.phone FROM camp_registrations r
     WHERE r.camp_id = ? AND r.checked_in_at IS NOT NULL AND r.status <> 'cancelled' AND r.phone GLOB '233[0-9]*' AND length(r.phone) = 12
       AND NOT EXISTS (SELECT 1 FROM camp_feedback_invites i WHERE i.registration_id = r.id AND (i.texted_at IS NOT NULL OR i.answered = 1))
     ORDER BY r.full_name`,
    [checkId(campId, "camp")],
  );
}

/**
 * Texts up to MAX_PER_SEND people their thank-you. Each person is claimed
 * first, so two coordinators pressing at once can't text anyone twice; a text
 * that fails is released for the next press. `send` is mNotify by default.
 */
export async function sendThanks(actor: string, camp: Camp, origin: string, send = (to: string, text: string) => sendSMS(to, text, COMMUNE_SENDER)) {
  if (!feedbackOpen(camp)) throw new CampError("Thank-you texts open on the camp's last day.");
  const pending = (await listThanksPending(camp.id)).slice(0, MAX_PER_SEND);
  if (!pending.length) throw new CampError("Everyone who arrived has had their thank-you.");
  const claims = await batch(
    "app",
    pending.map((p) => ({
      sql: `INSERT INTO camp_feedback_invites (camp_id, registration_id, texted_at, texted_by) VALUES (?, ?, ${NOW}, ?)
            ON CONFLICT (camp_id, registration_id) DO UPDATE SET texted_at = excluded.texted_at, texted_by = excluded.texted_by
            WHERE camp_feedback_invites.texted_at IS NULL AND camp_feedback_invites.answered = 0
            RETURNING registration_id`,
      params: [camp.id, p.id, actor],
    })),
  );
  const mine = pending.filter((_, i) => (claims[i]?.results?.length ?? 0) > 0);

  let sent = 0;
  const failed: string[] = [];
  for (let i = 0; i < mine.length; i += PARALLEL) {
    await Promise.all(
      mine.slice(i, i + PARALLEL).map(async (p) => {
        const ok = await send(p.phone, thanksText(camp, p.full_name.split(" ")[0], feedbackLink(origin, camp, p.id))).catch(() => false);
        if (ok) sent++;
        else failed.push(p.id);
      }),
    );
  }
  await batch("app", [
    ...failed.map((id) => ({ sql: "UPDATE camp_feedback_invites SET texted_at = NULL, texted_by = NULL WHERE camp_id = ? AND registration_id = ?", params: [camp.id, id] })),
    auditStatement({ actor, campId: camp.id, action: "feedback.text", entity: "camp", entityId: camp.id, after: { sent, failed: failed.length } }),
  ]);
  return { sent, failed: failed.length, remaining: (await listThanksPending(camp.id)).length };
}

/** Who a feedback link is for, if it may still be used. */
export async function feedbackPerson(camp: Camp, token: string) {
  const id = readToken("feedback", token);
  if (!id) return null;
  const [row] = await query<{ id: string; full_name: string; camp_id: string; status: string; checked_in_at: string | null; answered: number | null }>(
    "app",
    `SELECT r.id, r.full_name, r.camp_id, r.status, r.checked_in_at, i.answered FROM camp_registrations r
     LEFT JOIN camp_feedback_invites i ON i.registration_id = r.id AND i.camp_id = r.camp_id WHERE r.id = ?`,
    [id],
  );
  if (!row || row.camp_id !== camp.id || row.status === "cancelled" || !row.checked_in_at) return null;
  return { id: row.id, firstName: row.full_name.split(" ")[0], answered: row.answered === 1 };
}

export type FeedbackInput = { rating: number; best: string; change: string };

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);

/** Saves an answer, without who gave it. Once per person. */
export async function submitFeedback(camp: Camp, token: string, input: FeedbackInput) {
  if (!feedbackOpen(camp)) throw new CampError("Feedback opens on the camp's last day.");
  const person = await feedbackPerson(camp, token);
  if (!person) throw new CampError("This link isn't for this camp.");
  if (person.answered) throw new CampError("You've already told us. Thank you!");
  const rating = Math.round(Number(input.rating));
  if (!(rating >= 1 && rating <= 5)) throw new CampError("Choose how camp was, from 1 to 5.");
  await batch("app", [
    {
      sql: `INSERT INTO camp_feedback_invites (camp_id, registration_id, answered) VALUES (?, ?, 1)
            ON CONFLICT (camp_id, registration_id) DO UPDATE SET answered = 1 WHERE camp_feedback_invites.answered = 0`,
      params: [camp.id, person.id],
    },
    // Only if the line above marked them answered just now.
    { sql: "INSERT INTO camp_feedback (id, camp_id, rating, best, change) SELECT ?, ?, ?, ?, ? WHERE changes() > 0", params: [randomUUID(), camp.id, rating, clean(input.best), clean(input.change)] },
  ]);
}

export type FeedbackAnswer = { id: string; created_on: string; rating: number; best: string; change: string };
export type FeedbackSummary = {
  answers: number;
  average: number | null;
  /** How many gave each rating, 1 to 5. */
  ratings: number[];
  texted: number;
  arrived: number;
  pending: number;
};

export async function feedbackSummary(campId: string): Promise<FeedbackSummary> {
  checkId(campId, "camp");
  const [ratings, [counts], pending] = await Promise.all([
    query<{ rating: number; n: number }>("app", "SELECT rating, COUNT(*) AS n FROM camp_feedback WHERE camp_id = ? GROUP BY rating", [campId]),
    query<{ texted: number; arrived: number }>(
      "app",
      `SELECT (SELECT COUNT(*) FROM camp_feedback_invites WHERE camp_id = ? AND texted_at IS NOT NULL) AS texted,
              (SELECT COUNT(*) FROM camp_registrations WHERE camp_id = ? AND checked_in_at IS NOT NULL AND status <> 'cancelled') AS arrived`,
      [campId, campId],
    ),
    listThanksPending(campId),
  ]);
  const by = [1, 2, 3, 4, 5].map((n) => ratings.find((r) => r.rating === n)?.n ?? 0);
  const answers = by.reduce((a, b) => a + b, 0);
  return {
    answers,
    average: answers ? by.reduce((sum, n, i) => sum + n * (i + 1), 0) / answers : null,
    ratings: by,
    texted: counts?.texted ?? 0,
    arrived: counts?.arrived ?? 0,
    pending: pending.length,
  };
}

/** Answers with something written, newest first. */
export function listFeedback(campId: string, limit = 500) {
  return query<FeedbackAnswer>(
    "app",
    "SELECT id, created_on, rating, best, change FROM camp_feedback WHERE camp_id = ? AND (best <> '' OR change <> '') ORDER BY created_on DESC, rowid DESC LIMIT ?",
    [checkId(campId, "camp"), limit],
  );
}

/** Whether this person has given feedback (for the "How was camp?" card on their page). */
export async function hasAnswered(campId: string, registrationId: string) {
  const [row] = await query<{ answered: number }>("app", "SELECT answered FROM camp_feedback_invites WHERE camp_id = ? AND registration_id = ?", [campId, registrationId]);
  return row?.answered === 1;
}
