import { describe, expect, it } from "vitest";
import { placesLeft, placesState, remainingBeds } from "@/components/camp/places";
import type { RoomType } from "@/lib/camp/types";

const type = (over: Partial<RoomType> = {}): RoomType => ({
  id: "t",
  camp_id: "c",
  name: "Hostel",
  price_pesewas: 100,
  capacity: 4,
  places_male: null,
  places_female: null,
  ...over,
});

describe("placesLeft", () => {
  it("treats missing as no limit", () => {
    expect(placesLeft(null)).toBeNull();
    expect(placesLeft(undefined)).toBeNull();
    expect(placesLeft("")).toBeNull();
  });

  it("reads whole numbers, including D1 strings", () => {
    expect(placesLeft(0)).toBe(0);
    expect(placesLeft(12)).toBe(12);
    expect(placesLeft("7")).toBe(7);
    expect(placesLeft("0")).toBe(0);
  });
});

describe("placesState", () => {
  it("needs a gender", () => {
    expect(placesState(type({ places_male: 3 }), "")).toBeNull();
  });

  it("is full at 0, a count when set, and unlimited otherwise", () => {
    expect(placesState(type({ places_male: 0 }), "male")).toBe("full");
    expect(placesState(type({ places_male: 25 }), "male")).toBe(25);
    expect(placesState(type({ places_male: "4" as unknown as number }), "male")).toBe(4);
    expect(placesState(type({ places_male: null }), "male")).toBeNull();
    expect(placesState(type({ places_female: 0, places_male: 9 }), "female")).toBe("full");
    expect(placesState(type({ places_female: 0, places_male: 9 }), "male")).toBe(9);
  });

  it("counts remaining beds from people who have fully paid when a total is set", () => {
    expect(remainingBeds(type({ total_female: 10, taken_female: 2, places_female: 0 }), "female")).toBe(8);
    expect(placesState(type({ total_female: 10, taken_female: 10, places_female: 3 }), "female")).toBe("full");
    expect(placesState(type({ total_female: 10, taken_female: 12, places_female: 0 }), "female")).toBe("full");
    expect(placesState(type({ places_female: 4, taken_female: 9 }), "female")).toBe(4);
  });
});
