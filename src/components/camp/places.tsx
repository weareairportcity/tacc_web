import type { Gender, RoomType } from "@/lib/camp/types";

/** Shown once the number gets this low; above it, "places left" isn't worth the attention. */
const SHOW_BELOW = 20;

/** "· 4 left for women, full for men", from what the venue last told us. Nothing if there's no limit. */
export function PlacesNote({ type }: { type: RoomType }) {
  const parts: string[] = [];
  for (const [n, who] of [
    [type.places_female, "women"],
    [type.places_male, "men"],
  ] as const) {
    if (n === 0) parts.push(`full for ${who}`);
    else if (n !== null && n <= SHOW_BELOW) parts.push(`${n} left for ${who}`);
  }
  if (!parts.length) return null;
  return <span className="font-medium text-ink-black"> · {parts.join(", ")}</span>;
}

/** For one gender: null (no limit or plenty), "full", or a small number left. */
export function placesState(type: RoomType, gender: Gender | ""): "full" | number | null {
  if (!gender) return null;
  const n = gender === "male" ? type.places_male : type.places_female;
  if (n === 0) return "full";
  return n !== null && n <= SHOW_BELOW ? n : null;
}
