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
  for (const [raw, who] of [
    [type.places_female, "women"],
    [type.places_male, "men"],
  ] as const) {
    const n = placesLeft(raw);
    if (n === 0) parts.push(`full for ${who}`);
    else if (n !== null) parts.push(`${n} left for ${who}`);
  }
  if (!parts.length) return null;
  return <span className="font-medium text-ink-black"> · {parts.join(", ")}</span>;
}

/** For one gender: null (no limit), "full", or how many are left. */
export function placesState(type: RoomType, gender: Gender | ""): "full" | number | null {
  if (!gender) return null;
  const n = placesLeft(gender === "male" ? type.places_male : type.places_female);
  if (n === 0) return "full";
  return n;
}
