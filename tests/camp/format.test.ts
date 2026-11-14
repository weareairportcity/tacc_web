import { describe, expect, it } from "vitest";
import {
  formatAccraClock,
  formatAccraDay,
  formatAccraLong,
  formatAccraStamp,
  formatAccraTime,
  formatAccraWhen,
  formatDate,
  formatDateLong,
  formatDay,
  formatWeekday,
} from "@/components/camp/ui";

describe("camp dates", () => {
  it("formats calendar days the same on the server and in the browser", () => {
    expect(formatDay("2027-06-10")).toBe("10 Jun");
    expect(formatDate("2027-06-10")).toBe("10 Jun 2027");
    expect(formatDateLong("2026-12-18")).toBe("18 December 2026");
    expect(formatWeekday("2026-12-18")).toBe("Fri 18 Dec");
  });

  it("formats Accra clocks from UTC without the browser's locale", () => {
    const at = "2026-11-11T22:43:49.000Z";
    expect(formatAccraTime(at)).toBe("22:43");
    expect(formatAccraWhen(at)).toBe("11 Nov, 22:43");
    expect(formatAccraLong(at)).toBe("11 November 2026, 22:43");
    expect(formatAccraStamp(at)).toBe("Wed 11 Nov 10:43 pm");
    expect(formatAccraDay(at)).toBe("Wed 11 Nov");
    expect(formatAccraClock(at)).toBe("10:43 pm");
  });
});
