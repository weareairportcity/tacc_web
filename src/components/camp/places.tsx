import type { Gender, RoomType } from "@/lib/camp/types";

/** D1 may send integers as numbers or strings. null / missing = no limit set. */
export function placesLeft(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** "· 4 left for women, full for men", from what the venue last told us. Nothing if there's no limit. */
export function PlacesNote({ type }: { type: RoomType }) {
  const parts: string[] = [];
  for (const [gender, who] of [
    ["female", "women"],
    ["male", "men"],
  ] as const) {
    const n = remainingBeds(type, gender);
    if (n === 0) parts.push(`full for ${who}`);
    else if (n !== null) parts.push(`${n} left for ${who}`);
  }
  if (!parts.length) return null;
  return <span className="font-medium text-ink-black"> · {parts.join(", ")}</span>;
}

/**
 * Places left for one gender. When a total is set, remaining is total beds
 * minus people who have fully paid. Otherwise it is what the venue last said.
 */
export function remainingBeds(type: RoomType, gender: Gender): number | null {
  const total = placesLeft(gender === "male" ? type.total_male : type.total_female);
  if (total != null) {
    const taken = Number((gender === "male" ? type.taken_male : type.taken_female) ?? 0);
    return Math.max(0, total - taken);
  }
  return placesLeft(gender === "male" ? type.places_male : type.places_female);
}

/** For one gender: null (no limit), "full", or how many are left. */
export function placesState(type: RoomType, gender: Gender | ""): "full" | number | null {
  if (!gender) return null;
  const n = remainingBeds(type, gender);
  if (n === 0) return "full";
  return n;
}
