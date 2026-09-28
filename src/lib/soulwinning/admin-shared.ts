/**
 * Admin types and pure helpers shared by the server actions and the dashboard.
 * No directive: safe to import from both sides.
 */

export type Overview = {
  total_souls: number;
  tongues_count: number;
  church_count: number;
  pending_duplicates: number;
  entrant_count: number;
  group_count: number;
  located_count: number;
};

export type LeaderboardRow = {
  label: string;
  sublabel: string | null;
  souls: number;
  tongues: number;
  church: number;
};

export type HourlyRow = {
  hour: number;
  souls: number;
  tongues: number;
  church: number;
  cumulative: number;
};

export type DuplicateRow = {
  id: string;
  soul_name: string;
  phone: string | null;
  created_at: string;
  entrant_name: string;
  original_id: string | null;
  original_created_at: string | null;
  original_entrant_name: string | null;
};

export type MapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  soul_name: string;
  phone: string | null;
  photo_path: string | null;
  fellowship: string;
  pfcc?: string;
  entrant_name: string;
  spoke_in_tongues?: boolean;
  coming_to_church?: boolean;
  created_at: string;
  group_id?: string | null;
  /** 1 for a person; N when a class was saved as one group. */
  souls?: number;
  tongues?: number;
  church?: number;
};

export type Dimension = "fellowship" | "pfcc" | "entrant";

export type HourFilter = { from: number | null; to: number | null };

/** One pin per class — 75 identical GPS points must not spider into a flower. */
export function collapseMapPoints(points: MapPoint[]): MapPoint[] {
  const grouped = new Map<string, MapPoint[]>();
  const singles: MapPoint[] = [];

  for (const point of points) {
    if (point.group_id) {
      const list = grouped.get(point.group_id) ?? [];
      list.push(point);
      grouped.set(point.group_id, list);
    } else {
      singles.push(point);
    }
  }

  const collapsed: MapPoint[] = [...singles];

  for (const members of grouped.values()) {
    const sameName = members.every((item) => item.soul_name === members[0].soul_name);
    if (sameName && members.length > 1) {
      const lead = members.find((item) => item.photo_path) ?? members.find((item) => item.phone) ?? members[0];
      collapsed.push({
        ...lead,
        souls: members.length,
        tongues: members.filter((item) => item.spoke_in_tongues).length,
        church: members.filter((item) => item.coming_to_church).length,
        spoke_in_tongues: members.some((item) => item.spoke_in_tongues),
        coming_to_church: members.some((item) => item.coming_to_church),
      });
    } else {
      collapsed.push(...members);
    }
  }

  return collapsed;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (cell: string | number | null) => {
    const text = cell === null || cell === undefined ? "" : String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
}

/** Aggregate rankings — no personal data about the souls themselves. */
export function rankingsCsv(dimension: Dimension, rows: LeaderboardRow[]): string {
  return toCsv(
    ["rank", dimension, "detail", "souls", "spoke_in_tongues", "tongues_pct", "coming_to_church", "church_pct"],
    rows.map((row, index) => [
      index + 1,
      row.label,
      row.sublabel ?? "",
      row.souls,
      row.tongues,
      row.souls ? Math.round((row.tongues / row.souls) * 100) : 0,
      row.church,
      row.souls ? Math.round((row.church / row.souls) * 100) : 0,
    ])
  );
}
