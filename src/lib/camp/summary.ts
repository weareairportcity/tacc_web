import { query } from "@/lib/cf";
import { formatAccraLong, formatDate } from "@/components/camp/ui";
import { toCsv } from "./csv";
import { GROUPS } from "@/lib/fellowships";
import { getFellowshipBreakdown, type FellowshipRow } from "./reports";
import type { Camp, Gender } from "./types";

/**
 * The coordinator (and Pastor) camp summary: counts and money, no names.
 * Ranked the same way as the Pastor's report — most people first.
 */

const ghs = (pesewas: number) => (pesewas / 100).toFixed(2);
const peopleOf = (r: Pick<FellowshipRow, "registered" | "partially_paid" | "fully_paid">) =>
  r.registered + r.partially_paid + r.fully_paid;

export type RankedRow = {
  rank: number;
  name: string;
  pfcc?: string;
  group?: string;
  people: number;
  fully_paid: number;
  partially_paid: number;
  not_paid: number;
  expected: number;
  paid: number;
  outstanding: number;
};

export type RoomSummaryRow = {
  room_type_name: string;
  gender: Gender;
  people: number;
  fully_paid: number;
  expected: number;
  paid: number;
  outstanding: number;
};

export type CampSummary = {
  camp: Pick<Camp, "id" | "name" | "slug" | "venue" | "starts_on" | "ends_on" | "logo_url">;
  printedBy: string;
  printedAt: string;
  overview: {
    people: number;
    fully_paid: number;
    partially_paid: number;
    not_paid: number;
    cancelled: number;
    expected: number;
    collected: number;
    outstanding: number;
    outstandingPeople: number;
  };
  pfccs: RankedRow[];
  groups: RankedRow[];
  fellowships: RankedRow[];
  rooms: RoomSummaryRow[];
};

function line(name: string, r: Pick<FellowshipRow, "registered" | "partially_paid" | "fully_paid" | "expected" | "paid">, extra?: Pick<RankedRow, "pfcc" | "group">): Omit<RankedRow, "rank"> {
  return {
    name,
    ...extra,
    people: peopleOf(r),
    fully_paid: r.fully_paid,
    partially_paid: r.partially_paid,
    not_paid: r.registered,
    expected: r.expected,
    paid: r.paid,
    outstanding: Math.max(0, r.expected - r.paid),
  };
}

function rank(rows: Omit<RankedRow, "rank">[]): RankedRow[] {
  return [...rows]
    .filter((r) => r.people > 0)
    .sort((a, b) => b.people - a.people || b.fully_paid - a.fully_paid || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function sum(rows: FellowshipRow[]) {
  return rows.reduce(
    (t, f) => ({
      registered: t.registered + f.registered,
      partially_paid: t.partially_paid + f.partially_paid,
      fully_paid: t.fully_paid + f.fully_paid,
      expected: t.expected + f.expected,
      paid: t.paid + f.paid,
    }),
    { registered: 0, partially_paid: 0, fully_paid: 0, expected: 0, paid: 0 },
  );
}

/** Live snapshot for one camp, stamped with who asked and when (Accra). */
export async function getCampSummary(camp: Camp, printedBy: string, printedAt = new Date().toISOString()): Promise<CampSummary> {
  const [overview, fellowships, rooms] = await Promise.all([
    query<{
      people: number;
      fully_paid: number;
      partially_paid: number;
      not_paid: number;
      cancelled: number;
      expected: number;
      collected: number;
      outstanding: number;
      outstandingPeople: number;
    }>(
      "app",
      `SELECT
         COALESCE(SUM(r.status <> 'cancelled'), 0) AS people,
         COALESCE(SUM(r.status = 'fully_paid'), 0) AS fully_paid,
         COALESCE(SUM(r.status = 'partially_paid'), 0) AS partially_paid,
         COALESCE(SUM(r.status = 'registered'), 0) AS not_paid,
         COALESCE(SUM(r.status = 'cancelled'), 0) AS cancelled,
         COALESCE(SUM(CASE WHEN r.status <> 'cancelled' THEN r.price_pesewas ELSE 0 END), 0) AS expected,
         COALESCE(SUM(CASE WHEN r.status <> 'cancelled' THEN r.paid_pesewas ELSE 0 END), 0) AS collected,
         COALESCE(SUM(CASE WHEN r.status <> 'cancelled' THEN r.price_pesewas - r.paid_pesewas ELSE 0 END), 0) AS outstanding,
         COALESCE(SUM(r.status IN ('registered', 'partially_paid')), 0) AS outstandingPeople
       FROM camp_registrations r
       WHERE r.camp_id = ?`,
      [camp.id],
    ).then((rows) => rows[0] ?? {
      people: 0, fully_paid: 0, partially_paid: 0, not_paid: 0, cancelled: 0,
      expected: 0, collected: 0, outstanding: 0, outstandingPeople: 0,
    }),
    getFellowshipBreakdown(camp.id, { kind: "all" }),
    query<RoomSummaryRow>(
      "app",
      `SELECT t.name AS room_type_name, r.gender,
         SUM(r.status <> 'cancelled') AS people,
         SUM(r.status = 'fully_paid') AS fully_paid,
         SUM(CASE WHEN r.status <> 'cancelled' THEN r.price_pesewas ELSE 0 END) AS expected,
         SUM(CASE WHEN r.status <> 'cancelled' THEN r.paid_pesewas ELSE 0 END) AS paid,
         SUM(CASE WHEN r.status <> 'cancelled' THEN r.price_pesewas - r.paid_pesewas ELSE 0 END) AS outstanding
       FROM camp_registrations r
       JOIN camp_room_types t ON t.id = r.room_type_id
       WHERE r.camp_id = ?
       GROUP BY t.id, r.gender
       HAVING SUM(r.status <> 'cancelled') > 0
       ORDER BY t.price_pesewas, t.name, r.gender`,
      [camp.id],
    ),
  ]);

  const byPfcc = new Map<string, FellowshipRow[]>();
  for (const f of fellowships) {
    const list = byPfcc.get(f.pfcc) ?? [];
    list.push(f);
    byPfcc.set(f.pfcc, list);
  }

  return {
    camp,
    printedBy,
    printedAt,
    overview,
    pfccs: rank([...byPfcc.entries()].map(([name, rows]) => line(name, sum(rows)))),
    groups: rank(
      [...GROUPS, null].map((g) => line(g ?? "Children's Church", sum(fellowships.filter((f) => f.group === g)))),
    ),
    fellowships: rank(
      fellowships.map((f) => line(f.name, f, { pfcc: f.pfcc, group: f.group ?? "—" })),
    ),
    rooms,
  };
}

export function summaryCsv(s: CampSummary): string {
  const dates = `${formatDate(s.camp.starts_on)} – ${formatDate(s.camp.ends_on)}`;
  const rankHead = ["Rank", "Name", "People", "Fully paid", "Part paid", "Not paid", "Expected (GHS)", "Paid (GHS)", "Outstanding (GHS)"];
  const rankCells = (r: RankedRow) => [
    r.rank, r.name, r.people, r.fully_paid, r.partially_paid, r.not_paid, ghs(r.expected), ghs(r.paid), ghs(r.outstanding),
  ];
  const blank: (string | number | null)[] = [];
  return toCsv([
    ["Camp", s.camp.name],
    ["Venue", s.camp.venue],
    ["Dates", dates],
    ["Printed by", s.printedBy],
    ["Printed at", formatAccraLong(s.printedAt)],
    blank,
    ["Overview"],
    ["Registered", s.overview.people],
    ["Fully paid", s.overview.fully_paid],
    ["Part paid", s.overview.partially_paid],
    ["Not paid", s.overview.not_paid],
    ["Cancelled", s.overview.cancelled],
    ["Expected (GHS)", ghs(s.overview.expected)],
    ["Collected (GHS)", ghs(s.overview.collected)],
    ["Outstanding (GHS)", ghs(s.overview.outstanding)],
    ["People still to pay", s.overview.outstandingPeople],
    blank,
    ["PFCCs"],
    rankHead,
    ...s.pfccs.map(rankCells),
    blank,
    ["Groups"],
    rankHead,
    ...s.groups.map(rankCells),
    blank,
    ["Fellowships"],
    ["Rank", "Name", "PFCC", "Group", "People", "Fully paid", "Part paid", "Not paid", "Expected (GHS)", "Paid (GHS)", "Outstanding (GHS)"],
    ...s.fellowships.map((r) => [
      r.rank, r.name, r.pfcc ?? "", r.group ?? "", r.people, r.fully_paid, r.partially_paid, r.not_paid, ghs(r.expected), ghs(r.paid), ghs(r.outstanding),
    ]),
    blank,
    ["Rooms"],
    ["Room type", "Gender", "People", "Fully paid", "Expected (GHS)", "Paid (GHS)", "Outstanding (GHS)"],
    ...s.rooms.map((r) => [
      r.room_type_name, r.gender === "male" ? "Men" : "Women", r.people, r.fully_paid, ghs(r.expected), ghs(r.paid), ghs(r.outstanding),
    ]),
  ]);
}

export function summaryFilename(s: CampSummary, ext: "pdf" | "csv") {
  return `${s.camp.slug}-summary-${s.printedAt.slice(0, 10)}.${ext}`;
}
