import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { CAMP_PHOTOS, CAMP_STATUSES, CampError, type Camp, type CampInput, type CampPhoto } from "./types";

/**
 * Camps on D1 (database "tacc"). Every write goes in one batch with its audit
 * entry. Callers check the role first (requireCampRole); these take the
 * actor's email only to record it.
 */

const COLUMNS = `id, created_at, name, slug, venue, starts_on, ends_on, registration_opens_on,
  registration_closes_on, payment_due_on, roommate_deadline_on, fee_bps, status,
  logo_url, logo_credit, banner_url, banner_credit, venue_photo_url, venue_photo_credit, shirt_paid_only`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const ID = /^[0-9a-f-]{36}$/i;

export function checkId(id: string, what = "record") {
  if (typeof id !== "string" || !ID.test(id)) throw new CampError(`Unknown ${what}.`);
  return id;
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/** Trims and checks a camp form. Throws CampError with every problem at once. */
export function validateCampInput(raw: CampInput): CampInput {
  const input: CampInput = {
    ...raw,
    name: String(raw.name ?? "").trim(),
    venue: String(raw.venue ?? "").trim(),
    fee_bps: Number(raw.fee_bps),
  };
  const problems: string[] = [];
  if (!input.name) problems.push("Name is required.");
  if (input.name.length > 120) problems.push("Name is too long.");

  const dates = {
    starts_on: "Start date",
    ends_on: "End date",
    registration_opens_on: "Registration opens",
    registration_closes_on: "Registration closes",
    payment_due_on: "Full payment due",
    roommate_deadline_on: "Roommate deadline",
  } as const;
  for (const [key, label] of Object.entries(dates) as [keyof typeof dates, string][]) {
    if (!DATE.test(String(input[key] ?? "")) || Number.isNaN(Date.parse(input[key]))) {
      problems.push(`${label} must be a date.`);
    }
  }
  if (!problems.length) {
    if (input.ends_on < input.starts_on) problems.push("The camp can't end before it starts.");
    if (input.registration_closes_on < input.registration_opens_on) {
      problems.push("Registration can't close before it opens.");
    }
    if (input.payment_due_on > input.starts_on) problems.push("Full payment must be due by the start date.");
    if (input.roommate_deadline_on > input.starts_on) {
      problems.push("The roommate deadline must be on or before the start date.");
    }
  }
  if (!Number.isInteger(input.fee_bps) || input.fee_bps < 0 || input.fee_bps > 2000) {
    problems.push("The Paystack fee must be between 0% and 20%, to two decimal places.");
  }
  if (!CAMP_STATUSES.includes(input.status)) problems.push("Unknown status.");

  if (problems.length) throw new CampError(problems.join(" "));
  return input;
}

export async function listCamps(): Promise<Camp[]> {
  return query<Camp>("app", `SELECT ${COLUMNS} FROM camps ORDER BY starts_on DESC, created_at DESC`);
}

/** The public camp list: open and closed camps, soonest first. Drafts and archived camps aren't public. */
export async function listPublicCamps(): Promise<Camp[]> {
  return query<Camp>(
    "app",
    `SELECT ${COLUMNS} FROM camps WHERE status IN ('open', 'closed') ORDER BY starts_on, created_at`,
  );
}

export async function getCamp(id: string): Promise<Camp | null> {
  const [camp] = await query<Camp>("app", `SELECT ${COLUMNS} FROM camps WHERE id = ?`, [checkId(id, "camp")]);
  return camp ?? null;
}

/** The public camp page's camp. Drafts aren't public. */
export async function getCampBySlug(slug: string): Promise<Camp | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const [camp] = await query<Camp>("app", `SELECT ${COLUMNS} FROM camps WHERE slug = ? AND status <> 'draft'`, [slug]);
  return camp ?? null;
}

async function uniqueSlug(name: string) {
  const base = slugify(name) || "camp";
  const rows = await query<{ slug: string }>("app", "SELECT slug FROM camps WHERE slug = ? OR slug LIKE ?", [
    base,
    `${base}-%`,
  ]);
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export async function createCamp(actor: string, raw: CampInput): Promise<string> {
  const input = validateCampInput(raw);
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(input.name);
  await batch("app", [
    {
      sql: `INSERT INTO camps (id, name, slug, venue, starts_on, ends_on, registration_opens_on,
              registration_closes_on, payment_due_on, roommate_deadline_on, fee_bps, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        input.name,
        slug,
        input.venue,
        input.starts_on,
        input.ends_on,
        input.registration_opens_on,
        input.registration_closes_on,
        input.payment_due_on,
        input.roommate_deadline_on,
        input.fee_bps,
        input.status,
      ],
    },
    auditStatement({ actor, campId: id, action: "camp.create", entity: "camp", entityId: id, after: { ...input, slug } }),
  ]);
  return id;
}

/** The slug stays fixed after creation, so shared links keep working. */
export async function updateCamp(actor: string, id: string, raw: CampInput) {
  const before = await getCamp(id);
  if (!before) throw new CampError("Unknown camp.");
  const input = validateCampInput(raw);
  await batch("app", [
    {
      sql: `UPDATE camps SET name = ?, venue = ?, starts_on = ?, ends_on = ?, registration_opens_on = ?,
              registration_closes_on = ?, payment_due_on = ?, roommate_deadline_on = ?,
              fee_bps = ?, status = ?
            WHERE id = ?`,
      params: [
        input.name,
        input.venue,
        input.starts_on,
        input.ends_on,
        input.registration_opens_on,
        input.registration_closes_on,
        input.payment_due_on,
        input.roommate_deadline_on,
        input.fee_bps,
        input.status,
        id,
      ],
    },
    auditStatement({ actor, campId: id, action: "camp.update", entity: "camp", entityId: id, before, after: input }),
  ]);
}

/** Settings: whether T-shirts are only for people who've paid in full. */
export async function setShirtPaidOnly(actor: string, id: string, on: boolean) {
  const before = await getCamp(id);
  if (!before) throw new CampError("Unknown camp.");
  await batch("app", [
    { sql: "UPDATE camps SET shirt_paid_only = ? WHERE id = ?", params: [on ? 1 : 0, id] },
    auditStatement({ actor, campId: id, action: "camp.shirt_rule", entity: "camp", entityId: id, before: { shirt_paid_only: before.shirt_paid_only }, after: { shirt_paid_only: on ? 1 : 0 } }),
  ]);
}

/** Where camp photos may live: the church's public media host. */
const PHOTO_URL = /^https:\/\/media\.theairportcitychurch\.com\/[\w./-]+$/;

/**
 * Sets (or with an empty url, clears) one of a camp's images and its
 * credit. Callers upload the file to R2 first (putMedia) and pass its URL.
 */
export async function setCampPhoto(actor: string, id: string, kind: CampPhoto, url: string, credit: string) {
  if (!CAMP_PHOTOS.includes(kind)) throw new CampError("Unknown photo.");
  const before = await getCamp(id);
  if (!before) throw new CampError("Unknown camp.");
  const cleanUrl = String(url ?? "").trim();
  const cleanCredit = String(credit ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
  if (cleanUrl && !PHOTO_URL.test(cleanUrl)) throw new CampError("Upload the photo here; links to other sites aren't allowed.");
  const after = { url: cleanUrl, credit: cleanUrl ? cleanCredit : "" };
  await batch("app", [
    {
      // Column names come from CAMP_PHOTOS above, never from input.
      sql: `UPDATE camps SET ${kind}_url = ?, ${kind}_credit = ? WHERE id = ?`,
      params: [after.url, after.credit, id],
    },
    auditStatement({
      actor,
      campId: id,
      action: "camp.photo",
      entity: "camp",
      entityId: id,
      before: { kind, url: before[`${kind}_url`], credit: before[`${kind}_credit`] },
      after: { kind, ...after },
    }),
  ]);
}
