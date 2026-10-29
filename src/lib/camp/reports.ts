import { query, querySoon } from "@/lib/cf";
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

/** The ids, of these, that are in this camp and in scope: what a leader sends can't reach anyone else. */
export async function idsInScope(campId: string, ids: string[], scope: Scope) {
  const wanted = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 100);
  if (!wanted.length) return [];
  const s = scopeSql(scope);
  const rows = await query<{ id: string }>(
    "app",
    `SELECT r.id FROM camp_registrations r WHERE r.camp_id = ?${s.sql} AND r.id IN (${wanted.map(() => "?").join(",")})`,
    [checkId(campId, "camp"), ...s.params, ...wanted],
  );
  const found = new Set(rows.map((r) => r.id));
  return wanted.filter((id) => found.has(id));
}

// ─── People ──────────────────────────────────────────────────────────────────

export const ROOMMATE_STATUSES = ["unmatched", "in_group", "locked"] as const;
export type RoommateStatus = (typeof ROOMMATE_STATUSES)[number];
export const ROOMMATE_LABELS: Record<RoommateStatus, string> = {
  unmatched: "Unmatched",
  in_group: "In a group",
  // The key stays "locked" for saved views; groups close only at the deadline now.
  locked: "Group closed",
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

const OPEN_GROUP = "date('now') <= c.roommate_deadline_on";

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

type GroupColumns = { group_code: string | null; deadline: string };

function roommateStatus(status: RegistrationStatus, row: GroupColumns): RoommateStatus | null {
  if (row.group_code) {
    const state: GroupState = groupState({ roommate_deadline_on: row.deadline });
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

// Kept on the registration by triggers (migration 0018), so the list doesn't look it up per person.
const LAST_PAID = "r.last_paid_at";

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
       g.code AS group_code, c.roommate_deadline_on AS deadline, x.label AS room_label,
       r.flagged_payments AS flagged, r.shirt_size, r.any_room, r.checked_in_at, ${LAST_PAID} AS last_paid_at,
       r.last_paid_pesewas
     ${PEOPLE_FROM}
     WHERE r.camp_id = ?${where.sql}
     ORDER BY ${orderSql(filters.sort)}`,
    [checkId(campId, "camp"), ...where.params],
  );
  return rows.map(({ deadline, ...r }) => ({
    ...r,
    roommate: roommateStatus(r.status, { group_code: r.group_code, deadline }),
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
       g.code AS group_code, c.roommate_deadline_on AS deadline, ${LAST_PAID} AS last_paid_at
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

type CampRow = { status: RegistrationStatus; fellowship: string; pfcc: string; church: string; room_type_id: string; gender: Gender;
  n: number; price: number; paid: number; owing: number; flagged: number; placed: number; unmatched: number };

/**
 * Today's numbers. The registrations are read once, grouped by everything the page breaks them
 * down by, and added up here; rooms, groups and payments are each read once too. The answer is
 * shared for 30 seconds, so five coordinators on Today cost the database one read, not five.
 */
export async function getDashboard(campId: string, today = todayInGhana()): Promise<Dashboard> {
  checkId(campId, "camp");
  const [rows, [camp], types, beds, places, [extra], activity, tooBig] = await Promise.all([
    querySoon<CampRow>(
      "app",
      `SELECT r.status, r.fellowship, r.pfcc, r.church, r.room_type_id, r.gender, COUNT(*) AS n,
         SUM(r.price_pesewas) AS price, SUM(r.paid_pesewas) AS paid, SUM(r.paid_pesewas < r.price_pesewas) AS owing,
         SUM(r.flagged_payments) AS flagged, SUM(a.room_id IS NOT NULL) AS placed, SUM(m.registration_id IS NULL) AS unmatched
       FROM camp_registrations r
       LEFT JOIN camp_room_assignments a ON a.registration_id = r.id
       LEFT JOIN camp_group_members m ON m.registration_id = r.id
       WHERE r.camp_id = ?
       GROUP BY r.status, r.fellowship, r.pfcc, r.church, r.room_type_id, r.gender`,
      [campId],
    ),
    querySoon<{ payment_due_on: string; roommate_deadline_on: string; groups: number }>(
      "app",
      "SELECT c.payment_due_on, c.roommate_deadline_on, (SELECT COUNT(*) FROM camp_groups g WHERE g.camp_id = c.id) AS groups FROM camps c WHERE c.id = ?",
      [campId],
    ),
    querySoon<{ id: string; name: string; price_pesewas: number }>("app", "SELECT id, name, price_pesewas FROM camp_room_types WHERE camp_id = ?", [campId]),
    querySoon<{ room_type_id: string; gender: Gender; beds: number }>(
      "app",
      "SELECT room_type_id, gender, COALESCE(SUM(capacity), 0) AS beds FROM camp_rooms WHERE camp_id = ? GROUP BY room_type_id, gender",
      [campId],
    ),
    querySoon<{ room_type_id: string; gender: Gender; places_left: number | null }>(
      "app",
      "SELECT p.room_type_id, p.gender, p.places_left FROM camp_room_type_places p JOIN camp_room_types y ON y.id = p.room_type_id WHERE y.camp_id = ?",
      [campId],
    ),
    querySoon<{ fees: number; refunded: number }>(
      "app",
      `SELECT
         (SELECT COALESCE(SUM(p.fee_pesewas), 0) FROM camp_registrations q JOIN camp_payments p ON p.registration_id = q.id AND p.status = 'success'
            WHERE q.camp_id = ?1) AS fees,
         (SELECT COALESCE(SUM(f.amount_pesewas), 0) FROM camp_refunds f JOIN camp_registrations q ON q.id = f.registration_id
            WHERE q.camp_id = ?1) AS refunded`,
      [campId],
    ),
    querySoon<AuditEntry>(
      "app",
      "SELECT id, created_at, actor, action, entity, entity_id FROM camp_audit_log WHERE camp_id = ? ORDER BY id DESC LIMIT 20",
      [campId],
    ),
    querySoon<Dashboard["groupsTooBig"][number]>(
      "app",
      `WITH waiting AS (
         SELECT g.id, g.code, g.room_type_id, g.gender, COUNT(*) AS needs
         FROM camp_groups g JOIN camp_group_members m ON m.group_id = g.id
         LEFT JOIN camp_room_assignments a ON a.registration_id = m.registration_id
         WHERE g.camp_id = ?1 AND a.registration_id IS NULL
         GROUP BY g.id),
       used AS (
         SELECT a.room_id, COUNT(*) AS n FROM camp_room_assignments a JOIN camp_rooms y ON y.id = a.room_id
         WHERE y.camp_id = ?1 GROUP BY a.room_id),
       free AS (
         SELECT x.room_type_id, x.gender, MAX(x.capacity - COALESCE(u.n, 0)) AS most_free
         FROM camp_rooms x LEFT JOIN used u ON u.room_id = x.id
         WHERE x.camp_id = ?1 GROUP BY x.room_type_id, x.gender)
       SELECT w.code, t.name AS room_type_name, w.gender, w.needs, COALESCE(f.most_free, 0) AS most_free
       FROM waiting w JOIN camp_room_types t ON t.id = w.room_type_id
       LEFT JOIN free f ON f.room_type_id = w.room_type_id AND f.gender = w.gender
       WHERE w.needs > COALESCE(f.most_free, 0)
       ORDER BY t.price_pesewas, w.code`,
      [campId],
    ),
  ]);

  const status = Object.fromEntries(REGISTRATION_STATUSES.map((s) => [s, 0])) as Record<RegistrationStatus, number>;
  const money = { expected: 0, collected: 0, outstanding: 0, paidByCancelled: 0, refunded: extra?.refunded ?? 0, fees: extra?.fees ?? 0, flagged: 0 };
  const allocation = { placed: 0, waiting: 0, unmatched: 0 };
  let owing = 0;
  const by = { fellowship: new Map<string, Breakdown>(), pfcc: new Map<string, Breakdown>(), church: new Map<string, Breakdown>() };
  const pools = new Map<string, Omit<SupplyRow, "room_type_name" | "beds" | "places_left">>();
  const pool = (room_type_id: string, gender: Gender) => {
    const key = `${room_type_id}|${gender}`;
    if (!pools.has(key)) pools.set(key, { room_type_id, gender, registered: 0, fully_paid: 0, placed: 0 });
    return pools.get(key)!;
  };
  for (const r of rows) {
    status[r.status] += r.n;
    money.flagged += r.flagged;
    allocation.placed += r.placed;
    const p = pool(r.room_type_id, r.gender);
    p.placed += r.placed;
    if (r.status === "cancelled") money.paidByCancelled += r.paid;
    else {
      money.expected += r.price;
      money.collected += r.paid;
      money.outstanding += r.price - r.paid;
      owing += r.owing;
      p.registered += r.n;
    }
    if (r.status === "fully_paid") {
      p.fully_paid += r.n;
      allocation.waiting += r.n - r.placed;
      allocation.unmatched += r.unmatched;
    }
    for (const key of ["fellowship", "pfcc", "church"] as const) {
      const map = by[key];
      const b = map.get(r[key]) ?? { name: r[key], registered: 0, partially_paid: 0, fully_paid: 0, cancelled: 0 };
      b[r.status] += r.n;
      map.set(r[key], b);
    }
  }
  for (const b of beds) pool(b.room_type_id, b.gender);
  for (const p of places) pool(p.room_type_id, p.gender);
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const supply: SupplyRow[] = [...pools.values()]
    .filter((p) => typeOf.has(p.room_type_id))
    .map((p) => ({
      ...p,
      room_type_name: typeOf.get(p.room_type_id)!.name,
      beds: beds.find((b) => b.room_type_id === p.room_type_id && b.gender === p.gender)?.beds ?? 0,
      places_left: places.find((x) => x.room_type_id === p.room_type_id && x.gender === p.gender)?.places_left ?? null,
    }))
    .sort((a, b) => {
      const ta = typeOf.get(a.room_type_id)!;
      const tb = typeOf.get(b.room_type_id)!;
      return ta.price_pesewas - tb.price_pesewas || ta.name.localeCompare(tb.name) || a.gender.localeCompare(b.gender);
    });
  const total = (b: Breakdown) => b.registered + b.partially_paid + b.fully_paid + b.cancelled;
  const sorted = (map: Map<string, Breakdown>) => [...map.values()].sort((a, b) => total(b) - total(a) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const groups: Record<GroupState, number> = { open: 0, final: 0 };
  if (camp) groups[groupState(camp, today)] = camp.groups;

  return {
    status,
    pastDue: camp && today > camp.payment_due_on ? owing : 0,
    money,
    supply,
    allocation: { ...allocation, groups },
    groupsTooBig: tooBig,
    byFellowship: sorted(by.fellowship),
    byPfcc: sorted(by.pfcc),
    byChurch: sorted(by.church),
    activity,
  };
}

/** The two numbers the camp sidebar shows: people registered (not cancelled) and fully paid people waiting for a room. */
export async function navCounts(campId: string): Promise<{ people: number; waiting: number; requests: number }> {
  const [row] = await querySoon<{ people: number; waiting: number; requests: number }>(
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
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const [days, [money], latest] = await Promise.all([
    // One pass over the registrations gives the days, who still owes and who's arrived.
    querySoon<{ day: string; n: number; owing: number; here: number }>(
      "app",
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n, SUM(status IN ('registered', 'partially_paid')) AS owing,
         SUM(checked_in_at IS NOT NULL) AS here
       FROM camp_registrations WHERE camp_id = ? GROUP BY day`,
      [campId],
    ),
    querySoon<{ money_today: number }>(
      "app",
      `SELECT COALESCE(SUM(p.amount_pesewas), 0) AS money_today FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id
       WHERE p.status = 'success' AND p.paid_at >= ? AND p.paid_at < ? AND r.camp_id = ?`,
      [today, tomorrow, campId],
    ),
    querySoon<TodayNumbers["latestPayments"][number]>(
      "app",
      `SELECT p.registration_id, r.full_name, p.amount_pesewas, p.paid_at,
         CASE WHEN p.bulk_id IS NOT NULL THEN 'coordinator' WHEN p.payer_name <> '' THEN p.payer_name ELSE '' END AS by
       FROM camp_payments p JOIN camp_registrations r ON r.id = p.registration_id
       WHERE p.status = 'success' AND p.paid_at IS NOT NULL AND r.camp_id = ? ORDER BY p.paid_at DESC LIMIT 5`,
      [campId],
      15,
    ),
  ]);
  const totals = {
    new_today: days.find((d) => d.day === today)?.n ?? 0,
    money_today: money?.money_today ?? 0,
    outstanding_people: days.reduce((sum, d) => sum + d.owing, 0),
    arrived: days.reduce((sum, d) => sum + d.here, 0),
  };
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
