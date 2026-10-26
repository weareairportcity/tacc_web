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
  type PaymentStatus,
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
/** People sort orders. "latest": whoever paid (or registered) most recently first. */
export const PEOPLE_SORTS = ["latest", "name", "outstanding"] as const;
export type PeopleSort = (typeof PEOPLE_SORTS)[number];
/** Payment filter: a status, or "outstanding" (anyone with something left to pay). */
export const PAYMENT_FILTERS = [...REGISTRATION_STATUSES, "outstanding"] as const;
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];
export const CHECKIN_FILTERS = ["in", "out"] as const;

export type PeopleFilters = {
  q?: string;
  status?: PaymentFilter;
  fellowship?: string;
  pfcc?: string;
  church?: string;
  gender?: Gender;
  room_type?: string;
  roommate?: RoommateStatus;
  room?: (typeof ROOM_FILTERS)[number];
  checkin?: (typeof CHECKIN_FILTERS)[number];
  sort?: PeopleSort;
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
    status: pick(one("status"), PAYMENT_FILTERS),
    fellowship: pick(one("fellowship"), FELLOWSHIPS.map((f) => f.name)),
    pfcc: pick(one("pfcc"), PFCCS),
    church: pick(one("church"), CHURCHES),
    gender: pick(one("gender"), GENDERS),
    room_type: roomType && ID.test(roomType) ? roomType : undefined,
    roommate: pick(one("roommate"), ROOMMATE_STATUSES),
    room: pick(one("room"), ROOM_FILTERS),
    checkin: pick(one("checkin"), CHECKIN_FILTERS),
    sort: pick(one("sort"), PEOPLE_SORTS),
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
  if (filters.status === "outstanding") where.push("r.status IN ('registered', 'partially_paid')");
  else if (filters.status) {
    where.push("r.status = ?");
    params.push(filters.status);
  }
  if (filters.checkin === "in") where.push("r.checked_in_at IS NOT NULL");
  if (filters.checkin === "out") where.push("r.checked_in_at IS NULL AND r.status <> 'cancelled'");
  for (const key of ["fellowship", "pfcc", "church", "gender"] as const) {
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
  shirt_size: string;
  any_room: 0 | 1;
  checked_in_at: string | null;
  /** The latest successful payment, if any. */
  last_paid_at: string | null;
  last_paid_pesewas: number | null;
};

const LAST_PAID = `(SELECT p.paid_at FROM camp_payments p WHERE p.registration_id = r.id AND p.status = 'success' ORDER BY p.paid_at DESC LIMIT 1)`;

function orderSql(sort: PeopleSort | undefined) {
  if (sort === "name") return "r.full_name COLLATE NOCASE";
  if (sort === "outstanding") return "(r.price_pesewas - r.paid_pesewas) DESC, r.full_name COLLATE NOCASE";
  // Whoever paid most recently first; people who haven't paid yet after them, newest first.
  return "last_paid_at IS NULL, COALESCE(last_paid_at, r.created_at) DESC";
}

/** Coordinators: everyone in the camp, with contact details and money. */
export async function listPeople(campId: string, filters: PeopleFilters): Promise<PersonRow[]> {
  const where = filterSql(filters, { phoneSearch: true });
  const rows = await query<Omit<PersonRow, "roommate"> & GroupColumns>(
    "app",
    `SELECT r.id, r.created_at, r.full_name, r.phone, r.email, r.gender, r.fellowship, r.pfcc, r.church,
       t.name AS room_type_name, r.status, r.price_pesewas, r.paid_pesewas,
       g.code AS group_code, g.locked_at AS group_locked_at, c.roommate_deadline_on AS deadline, x.label AS room_label,
       (SELECT COUNT(*) FROM camp_payments p WHERE p.registration_id = r.id
          AND p.flag IN ('amount_mismatch', 'over_balance')) AS flagged,
       r.shirt_size, r.any_room, r.checked_in_at, ${LAST_PAID} AS last_paid_at,
       (SELECT p.amount_pesewas FROM camp_payments p WHERE p.registration_id = r.id AND p.status = 'success' ORDER BY p.paid_at DESC LIMIT 1) AS last_paid_pesewas
     ${PEOPLE_FROM}
     WHERE r.camp_id = ?${where.sql}
     ORDER BY ${orderSql(filters.sort)}`,
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
  pfcc: string;
  status: RegistrationStatus;
  price_pesewas: number;
  paid_pesewas: number;
  roommate: RoommateStatus | null;
  has_room: boolean;
};

/**
 * Leaders: only their scope, applied in SQL. They see who registered, what
 * each has paid and has outstanding, and who cancelled. No phone, email,
 * group codes, room labels or payment times are selected at all: the list
 * comes sorted, latest payment first. Search is by name only.
 */
export async function listPeopleForLeader(staff: Staff, campId: string, filters: PeopleFilters): Promise<LeaderRow[]> {
  const scope = scopeSql(scopeFor(staff));
  const where = filterSql(filters, { phoneSearch: false });
  const rows = await query<{ id: string; full_name: string; fellowship: string; pfcc: string; status: RegistrationStatus; price_pesewas: number; paid_pesewas: number; has_room: number; last_paid_at: string | null } & GroupColumns>(
    "app",
    `SELECT r.id, r.full_name, r.fellowship, r.pfcc, r.status, r.price_pesewas, r.paid_pesewas, a.room_id IS NOT NULL AS has_room,
       g.code AS group_code, g.locked_at AS group_locked_at, c.roommate_deadline_on AS deadline, ${LAST_PAID} AS last_paid_at
     ${PEOPLE_FROM}
     WHERE r.camp_id = ?${scope.sql}${where.sql}
     ORDER BY ${orderSql(filters.sort === "outstanding" ? "name" : filters.sort)}`,
    [checkId(campId, "camp"), ...scope.params, ...where.params],
  );
  return rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    fellowship: r.fellowship,
    pfcc: r.pfcc,
    status: r.status,
    price_pesewas: r.price_pesewas,
    paid_pesewas: r.paid_pesewas,
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
    ["Name", "Fellowship", "Payment status", "Paid (GHS)", "Outstanding (GHS)"],
    ...rows.map((r) => [
      r.full_name, r.fellowship, REGISTRATION_STATUS_LABELS[r.status], cedis(r.paid_pesewas),
      cedis(r.status === "cancelled" ? 0 : r.price_pesewas - r.paid_pesewas),
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
  /** What the venue last said is left for this gender; null = no limit. */
  places_left: number | null;
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
  money: {
    expected: number;
    collected: number;
    outstanding: number;
    /** Still held for cancelled registrations: refund it in Paystack, then record it. */
    paidByCancelled: number;
    refunded: number;
    fees: number;
    flagged: number;
  };
  /** Groups whose unplaced members need more beds together than any room in their pool has free. */
  groupsTooBig: { code: string; room_type_name: string; gender: Gender; needs: number; most_free: number }[];
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
  const [statusRows, [money], supply, [allocation], groupRows, byFellowship, byPfcc, byChurch, activity, tooBig] =
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
           (SELECT COALESCE(SUM(f.amount_pesewas), 0) FROM camp_refunds f JOIN camp_registrations q ON q.id = f.registration_id
              WHERE q.camp_id = ?1) AS refunded,
           COALESCE(SUM(r.status <> 'cancelled' AND r.paid_pesewas < r.price_pesewas AND ?2 > c.payment_due_on), 0) AS past_due
         FROM camps c LEFT JOIN camp_registrations r ON r.camp_id = c.id WHERE c.id = ?1`,
        [campId, today],
      ),
      query<SupplyRow>(
        "app",
        `WITH combos AS (
           SELECT room_type_id, gender FROM camp_registrations WHERE camp_id = ?1 AND status <> 'cancelled'
           UNION SELECT room_type_id, gender FROM camp_rooms WHERE camp_id = ?1
           UNION SELECT p.room_type_id, p.gender FROM camp_room_type_places p
             JOIN camp_room_types y ON y.id = p.room_type_id WHERE y.camp_id = ?1)
         SELECT k.room_type_id, t.name AS room_type_name, k.gender,
           (SELECT COUNT(*) FROM camp_registrations r WHERE r.camp_id = ?1 AND r.room_type_id = k.room_type_id
              AND r.gender = k.gender AND r.status <> 'cancelled') AS registered,
           (SELECT COUNT(*) FROM camp_registrations r WHERE r.camp_id = ?1 AND r.room_type_id = k.room_type_id
              AND r.gender = k.gender AND r.status = 'fully_paid') AS fully_paid,
           (SELECT COALESCE(SUM(capacity), 0) FROM camp_rooms x WHERE x.camp_id = ?1
              AND x.room_type_id = k.room_type_id AND x.gender = k.gender) AS beds,
           (SELECT COUNT(*) FROM camp_room_assignments a JOIN camp_rooms x ON x.id = a.room_id
              WHERE x.camp_id = ?1 AND x.room_type_id = k.room_type_id AND x.gender = k.gender) AS placed,
           (SELECT places_left FROM camp_room_type_places p
              WHERE p.room_type_id = k.room_type_id AND p.gender = k.gender) AS places_left
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
      query<Dashboard["groupsTooBig"][number]>(
        "app",
        `WITH waiting AS (
           SELECT g.id, g.code, g.room_type_id, g.gender, COUNT(*) AS needs
           FROM camp_groups g JOIN camp_group_members m ON m.group_id = g.id
           WHERE g.camp_id = ?1
             AND NOT EXISTS (SELECT 1 FROM camp_room_assignments a WHERE a.registration_id = m.registration_id)
           GROUP BY g.id)
         SELECT w.code, t.name AS room_type_name, w.gender, w.needs,
           COALESCE((SELECT MAX(x.capacity - (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id))
                     FROM camp_rooms x WHERE x.camp_id = ?1 AND x.room_type_id = w.room_type_id AND x.gender = w.gender), 0) AS most_free
         FROM waiting w JOIN camp_room_types t ON t.id = w.room_type_id
         WHERE w.needs > COALESCE((SELECT MAX(x.capacity - (SELECT COUNT(*) FROM camp_room_assignments a WHERE a.room_id = x.id))
                                   FROM camp_rooms x WHERE x.camp_id = ?1 AND x.room_type_id = w.room_type_id AND x.gender = w.gender), 0)
         ORDER BY t.price_pesewas, w.code`,
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
    groupsTooBig: tooBig,
    byFellowship,
    byPfcc,
    byChurch,
    activity,
  };
}

/** The two numbers the camp sidebar shows: people registered (not cancelled) and fully paid people waiting for a room. */
export async function navCounts(campId: string): Promise<{ people: number; waiting: number; requests: number }> {
  const [row] = await query<{ people: number; waiting: number; requests: number }>(
    "app",
    `SELECT COALESCE(SUM(r.status <> 'cancelled'), 0) AS people,
            COALESCE(SUM(r.status = 'fully_paid' AND a.room_id IS NULL), 0) AS waiting,
            (SELECT COUNT(*) FROM camp_requests q WHERE q.camp_id = ?1 AND q.status = 'pending') AS requests
     FROM camp_registrations r LEFT JOIN camp_room_assignments a ON a.registration_id = r.id
     WHERE r.camp_id = ?1`,
    [campId],
  );
  return row ?? { people: 0, waiting: 0, requests: 0 };
}

// ─── People filter counts ────────────────────────────────────────────────────

export type Facets = {
  total: number;
  outstanding: number;
  status: Record<string, number>;
  fellowship: Record<string, number>;
  pfcc: Record<string, number>;
  room_type: Record<string, number>;
  gender: Record<string, number>;
};

/**
 * How many people each filter option would show, given the other filters:
 * the counts next to options in the People filters. A facet ignores its own
 * filter, so picking Zion still shows how many Bethel has.
 */
export async function peopleFacets(campId: string, filters: PeopleFilters, scope: Scope = { kind: "all" }): Promise<Facets> {
  checkId(campId, "camp");
  const scoped = scopeSql(scope);
  const counts = async (column: string, without: (keyof PeopleFilters)[]) => {
    const rest = { ...filters };
    for (const k of without) delete rest[k];
    const where = filterSql(rest, { phoneSearch: scope.kind === "all" });
    const rows = await query<{ k: string; n: number }>(
      "app",
      `SELECT ${column} AS k, COUNT(*) AS n ${PEOPLE_FROM} WHERE r.camp_id = ?${scoped.sql}${where.sql} GROUP BY ${column}`,
      [campId, ...scoped.params, ...where.params],
    );
    return Object.fromEntries(rows.map((r) => [r.k, r.n]));
  };
  const all = filterSql(filters, { phoneSearch: scope.kind === "all" });
  const [[totals], status, fellowship, pfcc, room_type, gender] = await Promise.all([
    query<{ total: number; outstanding: number }>(
      "app",
      `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN r.status <> 'cancelled' THEN r.price_pesewas - r.paid_pesewas END), 0) AS outstanding
       ${PEOPLE_FROM} WHERE r.camp_id = ?${scoped.sql}${all.sql}`,
      [campId, ...scoped.params, ...all.params],
    ),
    counts("r.status", ["status"]),
    counts("r.fellowship", ["fellowship"]),
    counts("r.pfcc", ["pfcc", "fellowship"]),
    counts("r.room_type_id", ["room_type"]),
    counts("r.gender", ["gender"]),
  ]);
  status.outstanding = (status.registered ?? 0) + (status.partially_paid ?? 0);
  return { total: totals?.total ?? 0, outstanding: totals?.outstanding ?? 0, status, fellowship, pfcc, room_type, gender };
}

// ─── History (the audit log) ─────────────────────────────────────────────────

export const HISTORY_KINDS = ["money", "people", "rooms", "groups", "settings"] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];
const KIND_PREFIXES: Record<HistoryKind, string[]> = {
  money: ["payment.", "registration.refund"],
  people: ["registration.", "leader.", "people.", "view."],
  rooms: ["room.", "room_type."],
  groups: ["group."],
  settings: ["camp.", "staff."],
};

export type HistoryFilters = { who?: string; kind?: HistoryKind; days?: number; before?: number };
export type HistoryEntry = AuditEntry & { person: string | null };

/** The audit log, newest first, 50 at a time, with the person each entry is about. */
export async function listHistory(campId: string, filters: HistoryFilters): Promise<HistoryEntry[]> {
  checkId(campId, "camp");
  // Leaders' sign-ins belong to no one camp; they show in every camp's History.
  const where: string[] = ["(l.camp_id = ? OR (l.camp_id IS NULL AND l.actor LIKE 'leader:%'))"];
  const params: unknown[] = [campId];
  if (filters.who === "attendees") where.push("l.actor LIKE 'attendee:%'");
  else if (filters.who === "paystack") where.push("l.actor = 'paystack'");
  else if (filters.who) {
    where.push("l.actor = ?");
    params.push(filters.who);
  }
  if (filters.kind) {
    const prefixes = KIND_PREFIXES[filters.kind];
    where.push(`(${prefixes.map(() => "l.action LIKE ?").join(" OR ")})`);
    params.push(...prefixes.map((p) => `${p}%`));
  }
  if (filters.days) {
    where.push("l.created_at >= ?");
    params.push(new Date(Date.now() - filters.days * 86_400_000).toISOString());
  }
  if (filters.before) {
    where.push("l.id < ?");
    params.push(filters.before);
  }
  return query<HistoryEntry>(
    "app",
    `SELECT l.id, l.created_at, l.actor, l.action, l.entity, l.entity_id,
       COALESCE(
         (SELECT full_name FROM camp_registrations WHERE id = l.entity_id),
         (SELECT full_name FROM camp_registrations WHERE id = substr(l.actor, 10) AND l.actor LIKE 'attendee:%'),
         (SELECT full_name FROM camp_registrations WHERE id = json_extract(l.after_json, '$.registration_id')),
         (SELECT full_name FROM camp_registrations WHERE id = json_extract(l.before_json, '$.registration_id'))
       ) AS person
     FROM camp_audit_log l WHERE ${where.join(" AND ")} ORDER BY l.id DESC LIMIT 50`,
    params,
  );
}

/** Coordinators who appear in the log, for the "Who" filter. */
export async function historyActors(campId: string): Promise<string[]> {
  const rows = await query<{ actor: string }>(
    "app",
    "SELECT DISTINCT actor FROM camp_audit_log WHERE camp_id = ? AND actor LIKE '%@%' ORDER BY actor",
    [checkId(campId, "camp")],
  );
  return rows.map((r) => r.actor);
}

// ─── Money ───────────────────────────────────────────────────────────────────

export type BulkPaymentRow = {
  id: string;
  created_at: string;
  reference: string;
  paid_by: string;
  note: string;
  charged_pesewas: number;
  status: "pending" | "success" | "failed";
  paid_at: string | null;
  people: string;
  count: number;
};

/** Coordinators' payments for several people, newest first: who paid, for whom, how much. */
export function listBulkPayments(campId: string): Promise<BulkPaymentRow[]> {
  return query<BulkPaymentRow>(
    "app",
    `SELECT b.id, b.created_at, b.reference, b.paid_by, b.note, b.charged_pesewas, b.status, b.paid_at,
       (SELECT group_concat(r.full_name, ', ') FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id WHERE p.bulk_id = b.id) AS people,
       (SELECT COUNT(*) FROM camp_payments p WHERE p.bulk_id = b.id) AS count
     FROM camp_bulk_payments b WHERE b.camp_id = ? AND b.status <> 'failed' ORDER BY b.created_at DESC LIMIT 100`,
    [checkId(campId, "camp")],
  );
}

export type BulkReceipt = {
  reference: string;
  paid_by: string;
  note: string;
  amount_pesewas: number;
  fee_pesewas: number;
  charged_pesewas: number;
  status: PaymentStatus;
  created_at: string;
  paid_at: string | null;
  people: { id: string; full_name: string; fellowship: string; amount_pesewas: number; status: PaymentStatus; flag: string | null }[];
};

/** One pay-for-people payment: who it was for and what each got. */
export async function getBulkReceipt(campId: string, reference: string): Promise<BulkReceipt | null> {
  const [bulk] = await query<Omit<BulkReceipt, "people"> & { id: string }>(
    "app",
    `SELECT id, reference, paid_by, note, amount_pesewas, fee_pesewas, charged_pesewas, status, created_at, paid_at
     FROM camp_bulk_payments WHERE camp_id = ? AND reference = ?`,
    [checkId(campId, "camp"), String(reference)],
  );
  if (!bulk) return null;
  const people = await query<BulkReceipt["people"][number]>(
    "app",
    `SELECT r.id, r.full_name, r.fellowship, p.amount_pesewas, p.status, p.flag
     FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id
     WHERE p.bulk_id = ? ORDER BY r.full_name`,
    [bulk.id],
  );
  return {
    reference: bulk.reference,
    paid_by: bulk.paid_by,
    note: bulk.note,
    amount_pesewas: bulk.amount_pesewas,
    fee_pesewas: bulk.fee_pesewas,
    charged_pesewas: bulk.charged_pesewas,
    status: bulk.status,
    created_at: bulk.created_at,
    paid_at: bulk.paid_at,
    people,
  };
}

// ─── Find a person (top bar) ─────────────────────────────────────────────────

export type FoundPerson = { id: string; full_name: string; fellowship: string; status: RegistrationStatus; room_label: string | null };

/** Up to 8 people whose name (or, for coordinators, phone) matches, for the search box as you type. */
export async function findPeople(campId: string, raw: string, scope: Scope = { kind: "all" }): Promise<FoundPerson[]> {
  const q = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (q.length < 2) return [];
  const scoped = scopeSql(scope);
  const where = filterSql({ q }, { phoneSearch: scope.kind === "all" });
  return query<FoundPerson>(
    "app",
    `SELECT r.id, r.full_name, r.fellowship, r.status, ${scope.kind === "all" ? "x.label" : "NULL"} AS room_label
     ${PEOPLE_FROM}
     WHERE r.camp_id = ?${scoped.sql}${where.sql}
     ORDER BY CASE WHEN r.full_name LIKE ? THEN 0 ELSE 1 END, r.full_name COLLATE NOCASE LIMIT 8`,
    [checkId(campId, "camp"), ...scoped.params, ...where.params, `${q.replace(/[\\%_]/g, "")}%`],
  );
}

// ─── Today (the overview) ────────────────────────────────────────────────────

export type TodayNumbers = {
  newToday: number;
  moneyToday: number;
  /** People with something left to pay. */
  outstandingPeople: number;
  arrived: number;
  /** Registrations per day for the last 14 days, oldest first. */
  perDay: { day: string; n: number }[];
  latestPayments: { registration_id: string; full_name: string; amount_pesewas: number; paid_at: string; by: string }[];
};

export async function getTodayNumbers(campId: string, today = todayInGhana()): Promise<TodayNumbers> {
  checkId(campId, "camp");
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 13 * 86_400_000).toISOString().slice(0, 10);
  const [[totals], days, latest] = await Promise.all([
    query<{ new_today: number; money_today: number; outstanding_people: number; arrived: number }>(
      "app",
      `SELECT
         (SELECT COUNT(*) FROM camp_registrations WHERE camp_id = ?1 AND substr(created_at, 1, 10) = ?2) AS new_today,
         (SELECT COALESCE(SUM(p.amount_pesewas), 0) FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id
            WHERE r.camp_id = ?1 AND p.status = 'success' AND substr(p.paid_at, 1, 10) = ?2) AS money_today,
         (SELECT COUNT(*) FROM camp_registrations WHERE camp_id = ?1 AND status IN ('registered', 'partially_paid')) AS outstanding_people,
         (SELECT COUNT(*) FROM camp_registrations WHERE camp_id = ?1 AND checked_in_at IS NOT NULL) AS arrived`,
      [campId, today],
    ),
    query<{ day: string; n: number }>(
      "app",
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM camp_registrations
       WHERE camp_id = ? AND substr(created_at, 1, 10) >= ? GROUP BY day`,
      [campId, from],
    ),
    query<TodayNumbers["latestPayments"][number]>(
      "app",
      `SELECT p.registration_id, r.full_name, p.amount_pesewas, p.paid_at,
         CASE WHEN p.bulk_id IS NOT NULL THEN 'coordinator' WHEN p.payer_name <> '' THEN p.payer_name ELSE '' END AS by
       FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id
       WHERE r.camp_id = ? AND p.status = 'success' AND p.paid_at IS NOT NULL ORDER BY p.paid_at DESC LIMIT 5`,
      [campId],
    ),
  ]);
  const perDay = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    return { day, n: days.find((d) => d.day === day)?.n ?? 0 };
  });
  return {
    newToday: totals?.new_today ?? 0,
    moneyToday: totals?.money_today ?? 0,
    outstandingPeople: totals?.outstanding_people ?? 0,
    arrived: totals?.arrived ?? 0,
    perDay,
    latestPayments: latest,
  };
}
