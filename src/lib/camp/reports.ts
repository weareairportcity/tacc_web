import { query } from "@/lib/cf";
import { CHURCHES, FELLOWSHIPS, PFCCS } from "@/lib/fellowships";
import type { AuditEntry } from "./audit";
import { ID, checkId } from "./camps";
import { formatGroupCode } from "./codes";
import { toCsv } from "./csv";
import { groupState } from "./groups";
import { todayInGhana } from "./registrations";
import {
  CampError,
  GENDERS,
  REGISTRATION_STATUSES,
  REGISTRATION_STATUS_LABELS,
  type Gender,
  type GroupState,
  type RegistrationStatus,
  type Staff,
} from "./types";

/**
 * The coordinator dashboard and the people lists (coordinator and leader).
 * Every number is counted from the live tables, so it can't drift from them.
 *
 * Leaders: `scopeFor` turns the signed-in staff record into a Scope, and
 * every leader query adds it to its WHERE clause. Nothing a leader sends
 * (filters, ids) can widen it, and leader rows carry no contact details or
 * amounts.
 */

// ─── Scope ───────────────────────────────────────────────────────────────────

export type Scope = { kind: "all" } | { kind: "fellowship" | "pfcc"; value: string };

/** Coordinators and admins see everyone; a leader sees their own fellowship or PFCC. */
export function scopeFor(staff: Staff): Scope {
  if (staff.role === "admin" || staff.role === "coordinator") return { kind: "all" };
  if (staff.role === "leader" && staff.scope_kind && staff.scope_value) {
    return { kind: staff.scope_kind, value: staff.scope_value };
  }
  throw new CampError("Your leader account isn't linked to a fellowship or PFCC yet. Ask a camp admin.");
}

function scopeSql(scope: Scope): { sql: string; params: unknown[] } {
  if (scope.kind === "all") return { sql: "", params: [] };
  return { sql: ` AND r.${scope.kind === "fellowship" ? "fellowship" : "pfcc"} = ?`, params: [scope.value] };
}

// ─── People ──────────────────────────────────────────────────────────────────

export const ROOMMATE_STATUSES = ["unmatched", "in_group", "locked"] as const;
export type RoommateStatus = (typeof ROOMMATE_STATUSES)[number];
export const ROOMMATE_LABELS: Record<RoommateStatus, string> = {
  unmatched: "Unmatched",
  in_group: "In a group",
  locked: "Locked",
};

export const ROOM_FILTERS = ["placed", "waiting"] as const;

export type PeopleFilters = {
  q?: string;
  status?: RegistrationStatus;
  fellowship?: string;
  pfcc?: string;
  church?: string;
  gender?: Gender;
  room_type?: string;
  roommate?: RoommateStatus;
  room?: (typeof ROOM_FILTERS)[number];
};

const pick = <T extends string>(value: unknown, allowed: readonly T[]) =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

/** Keeps only filters with a known value; anything else is dropped, never passed to SQL as-is. */
export function parsePeopleFilters(raw: Record<string, string | string[] | undefined>): PeopleFilters {
  const one = (key: string) => (Array.isArray(raw[key]) ? raw[key][0] : raw[key]);
  const q = one("q")?.replace(/\s+/g, " ").trim().slice(0, 60);
  const roomType = one("room_type");
  return {
    q: q || undefined,
    status: pick(one("status"), REGISTRATION_STATUSES),
    fellowship: pick(one("fellowship"), FELLOWSHIPS.map((f) => f.name)),
    pfcc: pick(one("pfcc"), PFCCS),
    church: pick(one("church"), CHURCHES),
    gender: pick(one("gender"), GENDERS),
    room_type: roomType && ID.test(roomType) ? roomType : undefined,
    roommate: pick(one("roommate"), ROOMMATE_STATUSES),
    room: pick(one("room"), ROOM_FILTERS),
  };
}

/** The filters as a query string, for links and the export URL. */
export function filtersToQuery(filters: PeopleFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}

const LIKE = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const OPEN_GROUP = "g.locked_at IS NULL AND date('now') <= c.roommate_deadline_on";

function filterSql(filters: PeopleFilters, { phoneSearch }: { phoneSearch: boolean }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.q) {
    const digits = filters.q.replace(/\D/g, "").replace(/^0/, "");
    if (phoneSearch && digits.length >= 3) {
      where.push("(r.full_name LIKE ? ESCAPE '\\' OR r.phone LIKE ?)");
      params.push(LIKE(filters.q), `%${digits}%`);
    } else {
      where.push("r.full_name LIKE ? ESCAPE '\\'");
      params.push(LIKE(filters.q));
    }
  }
  for (const key of ["status", "fellowship", "pfcc", "church", "gender"] as const) {
    if (filters[key]) {
      where.push(`r.${key} = ?`);
      params.push(filters[key]);
    }
  }
  if (filters.room_type) {
    where.push("r.room_type_id = ?");
    params.push(filters.room_type);
  }
  if (filters.roommate === "unmatched") where.push("r.status = 'fully_paid' AND g.id IS NULL");
  if (filters.roommate === "in_group") where.push(`g.id IS NOT NULL AND ${OPEN_GROUP}`);
  if (filters.roommate === "locked") where.push(`g.id IS NOT NULL AND NOT (${OPEN_GROUP})`);
  if (filters.room === "placed") where.push("a.room_id IS NOT NULL");
  if (filters.room === "waiting") where.push("r.status = 'fully_paid' AND a.room_id IS NULL");
  return { sql: where.map((w) => ` AND ${w}`).join(""), params };
}

const PEOPLE_FROM = `FROM camp_registrations r
  JOIN camp_room_types t ON t.id = r.room_type_id
  JOIN camps c ON c.id = r.camp_id
  LEFT JOIN camp_group_members m ON m.registration_id = r.id
  LEFT JOIN camp_groups g ON g.id = m.group_id
  LEFT JOIN camp_room_assignments a ON a.registration_id = r.id
  LEFT JOIN camp_rooms x ON x.id = a.room_id`;

type GroupColumns = { group_code: string | null; group_locked_at: string | null; deadline: string };

function roommateStatus(status: RegistrationStatus, row: GroupColumns): RoommateStatus | null {
  if (row.group_code) {
    const state: GroupState = groupState({ locked_at: row.group_locked_at, roommate_deadline_on: row.deadline });
    return state === "open" ? "in_group" : "locked";
  }
  return status === "fully_paid" ? "unmatched" : null;
}

export type PersonRow = {
  id: string;
  created_at: string;
  full_name: string;
  phone: string;
  email: string;
  gender: Gender;
  fellowship: string;
  pfcc: string;
  church: string;
  room_type_name: string;
  status: RegistrationStatus;
  price_pesewas: number;
  paid_pesewas: number;
  group_code: string | null;
  roommate: RoommateStatus | null;
  room_label: string | null;
  /** Payments a coordinator should look at. */
  flagged: number;
};

/** Coordinators: everyone in the camp, with contact details and money. */
export async function listPeople(campId: string, filters: PeopleFilters): Promise<PersonRow[]> {
  const where = filterSql(filters, { phoneSearch: true });
  const rows = await query<Omit<PersonRow, "roommate"> & GroupColumns>(
    "app",
    `SELECT r.id, r.created_at, r.full_name, r.phone, r.email, r.gender, r.fellowship, r.pfcc, r.church,
       t.name AS room_type_name, r.status, r.price_pesewas, r.paid_pesewas,
       g.code AS group_code, g.locked_at AS group_locked_at, c.roommate_deadline_on AS deadline, x.label AS room_label,
       (SELECT COUNT(*) FROM camp_payments p WHERE p.registration_id = r.id
          AND p.flag IN ('amount_mismatch', 'over_balance')) AS flagged
     ${PEOPLE_FROM}
     WHERE r.camp_id = ?${where.sql}
     ORDER BY r.full_name COLLATE NOCASE`,
    [checkId(campId, "camp"), ...where.params],
  );
  return rows.map(({ group_locked_at, deadline, ...r }) => ({
    ...r,
    roommate: roommateStatus(r.status, { group_code: r.group_code, group_locked_at, deadline }),
  }));
}

export type LeaderRow = {
  id: string;
  full_name: string;
  fellowship: string;
  status: RegistrationStatus;
  roommate: RoommateStatus | null;
  has_room: boolean;
};

/**
 * Leaders: only their scope, applied in SQL. No phone, email, amounts, group
 * codes or room labels are selected at all. Search is by name only.
 */
export async function listPeopleForLeader(staff: Staff, campId: string, filters: PeopleFilters): Promise<LeaderRow[]> {
  const scope = scopeSql(scopeFor(staff));
  const where = filterSql(filters, { phoneSearch: false });
  const rows = await query<{ id: string; full_name: string; fellowship: string; status: RegistrationStatus; has_room: number } & GroupColumns>(
    "app",
    `SELECT r.id, r.full_name, r.fellowship, r.status, a.room_id IS NOT NULL AS has_room,
       g.code AS group_code, g.locked_at AS group_locked_at, c.roommate_deadline_on AS deadline
     ${PEOPLE_FROM}
     WHERE r.camp_id = ?${scope.sql}${where.sql}
     ORDER BY r.full_name COLLATE NOCASE`,
    [checkId(campId, "camp"), ...scope.params, ...where.params],
  );
  return rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    fellowship: r.fellowship,
    status: r.status,
    roommate: roommateStatus(r.status, r),
    has_room: Boolean(r.has_room),
  }));
}

const cedis = (pesewas: number) => (pesewas / 100).toFixed(2);

export function peopleCsv(rows: PersonRow[]) {
  return toCsv([
    ["Name", "Phone", "Email", "Gender", "Fellowship", "PFCC", "Church", "Room type", "Status", "Price (GHS)",
      "Paid (GHS)", "Balance (GHS)", "Group", "Roommates", "Room", "Registered"],
    ...rows.map((r) => [
      r.full_name, r.phone, r.email, r.gender, r.fellowship, r.pfcc, r.church, r.room_type_name,
      REGISTRATION_STATUS_LABELS[r.status], cedis(r.price_pesewas), cedis(r.paid_pesewas),
      cedis(r.price_pesewas - r.paid_pesewas), r.group_code && formatGroupCode(r.group_code), r.roommate ? ROOMMATE_LABELS[r.roommate] : null,
      r.room_label, r.created_at.slice(0, 10),
    ]),
  ]);
}

export function leaderCsv(rows: LeaderRow[]) {
  return toCsv([
    ["Name", "Fellowship", "Payment status", "Roommates", "Room assigned"],
    ...rows.map((r) => [
      r.full_name, r.fellowship, REGISTRATION_STATUS_LABELS[r.status],
      r.roommate ? ROOMMATE_LABELS[r.roommate] : null, r.has_room ? "Yes" : "No",
    ]),
  ]);
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export type SupplyRow = {
  room_type_id: string;
  room_type_name: string;
  gender: Gender;
  registered: number;
  fully_paid: number;
  beds: number;
  placed: number;
};

export type Breakdown = {
  name: string;
  registered: number;
  partially_paid: number;
  fully_paid: number;
  cancelled: number;
};

export type Dashboard = {
  status: Record<RegistrationStatus, number>;
  pastDue: number;
  money: { expected: number; collected: number; outstanding: number; paidByCancelled: number; fees: number; flagged: number };
  supply: SupplyRow[];
  allocation: { placed: number; waiting: number; unmatched: number; groups: Record<GroupState, number> };
  byFellowship: Breakdown[];
  byPfcc: Breakdown[];
  byChurch: Breakdown[];
  activity: AuditEntry[];
};

const BREAKDOWN = (column: "fellowship" | "pfcc" | "church") =>
  `SELECT ${column} AS name,
     SUM(status = 'registered') AS registered, SUM(status = 'partially_paid') AS partially_paid,
     SUM(status = 'fully_paid') AS fully_paid, SUM(status = 'cancelled') AS cancelled
   FROM camp_registrations WHERE camp_id = ? GROUP BY ${column} ORDER BY COUNT(*) DESC, ${column}`;

export async function getDashboard(campId: string, today = todayInGhana()): Promise<Dashboard> {
  checkId(campId, "camp");
  const [statusRows, [money], supply, [allocation], groupRows, byFellowship, byPfcc, byChurch, activity] =
    await Promise.all([
      query<{ status: RegistrationStatus; n: number }>(
        "app",
        "SELECT status, COUNT(*) AS n FROM camp_registrations WHERE camp_id = ? GROUP BY status",
        [campId],
      ),
      query<Dashboard["money"] & { past_due: number }>(
        "app",
        `SELECT
           COALESCE(SUM(CASE WHEN r.status <> 'cancelled' THEN r.price_pesewas END), 0) AS expected,
           COALESCE(SUM(CASE WHEN r.status <> 'cancelled' THEN r.paid_pesewas END), 0) AS collected,
           COALESCE(SUM(CASE WHEN r.status <> 'cancelled' THEN r.price_pesewas - r.paid_pesewas END), 0) AS outstanding,
           COALESCE(SUM(CASE WHEN r.status = 'cancelled' THEN r.paid_pesewas END), 0) AS paidByCancelled,
           (SELECT COALESCE(SUM(p.fee_pesewas), 0) FROM camp_payments p JOIN camp_registrations q ON q.id = p.registration_id
              WHERE q.camp_id = ?1 AND p.status = 'success') AS fees,
           (SELECT COUNT(*) FROM camp_payments p JOIN camp_registrations q ON q.id = p.registration_id
              WHERE q.camp_id = ?1 AND p.flag IN ('amount_mismatch', 'over_balance')) AS flagged,
           COALESCE(SUM(r.status <> 'cancelled' AND r.paid_pesewas < r.price_pesewas AND ?2 > c.payment_due_on), 0) AS past_due
         FROM camps c LEFT JOIN camp_registrations r ON r.camp_id = c.id WHERE c.id = ?1`,
        [campId, today],
      ),
      query<SupplyRow>(
        "app",
        `WITH combos AS (
           SELECT room_type_id, gender FROM camp_registrations WHERE camp_id = ?1 AND status <> 'cancelled'
           UNION SELECT room_type_id, gender FROM camp_rooms WHERE camp_id = ?1)
         SELECT k.room_type_id, t.name AS room_type_name, k.gender,
           (SELECT COUNT(*) FROM camp_registrations r WHERE r.camp_id = ?1 AND r.room_type_id = k.room_type_id
              AND r.gender = k.gender AND r.status <> 'cancelled') AS registered,
           (SELECT COUNT(*) FROM camp_registrations r WHERE r.camp_id = ?1 AND r.room_type_id = k.room_type_id
              AND r.gender = k.gender AND r.status = 'fully_paid') AS fully_paid,
           (SELECT COALESCE(SUM(capacity), 0) FROM camp_rooms x WHERE x.camp_id = ?1
              AND x.room_type_id = k.room_type_id AND x.gender = k.gender) AS beds,
           (SELECT COUNT(*) FROM camp_room_assignments a JOIN camp_rooms x ON x.id = a.room_id
              WHERE x.camp_id = ?1 AND x.room_type_id = k.room_type_id AND x.gender = k.gender) AS placed
         FROM combos k JOIN camp_room_types t ON t.id = k.room_type_id
         ORDER BY t.price_pesewas, t.name, k.gender`,
        [campId],
      ),
      query<Omit<Dashboard["allocation"], "groups">>(
        "app",
        `SELECT
           COALESCE(SUM(a.room_id IS NOT NULL), 0) AS placed,
           COALESCE(SUM(r.status = 'fully_paid' AND a.room_id IS NULL), 0) AS waiting,
           COALESCE(SUM(r.status = 'fully_paid' AND m.registration_id IS NULL), 0) AS unmatched
         FROM camp_registrations r
         LEFT JOIN camp_room_assignments a ON a.registration_id = r.id
         LEFT JOIN camp_group_members m ON m.registration_id = r.id
         WHERE r.camp_id = ?`,
        [campId],
      ),
      query<{ locked_at: string | null; roommate_deadline_on: string }>(
        "app",
        "SELECT g.locked_at, c.roommate_deadline_on FROM camp_groups g JOIN camps c ON c.id = g.camp_id WHERE g.camp_id = ?",
        [campId],
      ),
      query<Breakdown>("app", BREAKDOWN("fellowship"), [campId]),
      query<Breakdown>("app", BREAKDOWN("pfcc"), [campId]),
      query<Breakdown>("app", BREAKDOWN("church"), [campId]),
      query<AuditEntry>(
        "app",
        "SELECT id, created_at, actor, action, entity, entity_id FROM camp_audit_log WHERE camp_id = ? ORDER BY id DESC LIMIT 20",
        [campId],
      ),
    ]);

  const status = Object.fromEntries(REGISTRATION_STATUSES.map((s) => [s, 0])) as Record<RegistrationStatus, number>;
  for (const row of statusRows) status[row.status] = row.n;
  const groups: Record<GroupState, number> = { open: 0, locked: 0, final: 0 };
  for (const g of groupRows) groups[groupState(g, today)]++;
  const { past_due: pastDue, ...moneyTotals } = money;

  return {
    status,
    pastDue,
    money: moneyTotals,
    supply,
    allocation: { ...allocation, groups },
    byFellowship,
    byPfcc,
    byChurch,
    activity,
  };
}
