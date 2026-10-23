import { batch, query } from "@/lib/cf";
import { auditStatement } from "./audit";
import { CAMP_STATUSES, CampError, type Camp, type CampInput } from "./types";

/**
 * Camps on D1 (database "tacc"). Every write goes in one batch with its audit
 * entry. Callers check the role first (requireCampRole); these take the
 * actor's email only to record it.
 */

const COLUMNS = `id, created_at, name, slug, venue, starts_on, ends_on, registration_opens_on,
  registration_closes_on, payment_due_on, roommate_deadline_on, min_first_payment_pct, status`;

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
    min_first_payment_pct: Number(raw.min_first_payment_pct),
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
  if (!Number.isInteger(input.min_first_payment_pct) || input.min_first_payment_pct < 1 || input.min_first_payment_pct > 100) {
    problems.push("Minimum first payment must be a whole percentage from 1 to 100.");
  }
  if (!CAMP_STATUSES.includes(input.status)) problems.push("Unknown status.");

  if (problems.length) throw new CampError(problems.join(" "));
  return input;
}

export async function listCamps(): Promise<Camp[]> {
  return query<Camp>("app", `SELECT ${COLUMNS} FROM camps ORDER BY starts_on DESC, created_at DESC`);
}

export async function getCamp(id: string): Promise<Camp | null> {
  const [camp] = await query<Camp>("app", `SELECT ${COLUMNS} FROM camps WHERE id = ?`, [checkId(id, "camp")]);
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
              registration_closes_on, payment_due_on, roommate_deadline_on, min_first_payment_pct, status)
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
        input.min_first_payment_pct,
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
              min_first_payment_pct = ?, status = ?
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
        input.min_first_payment_pct,
        input.status,
        id,
      ],
    },
    auditStatement({ actor, campId: id, action: "camp.update", entity: "camp", entityId: id, before, after: input }),
  ]);
}
