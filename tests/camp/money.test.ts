import { describe, expect, it } from "vitest";
import { cedisToPesewas, formatCedis, pesewasToCedisInput } from "@/lib/camp/money";
import { CampError } from "@/lib/camp/types";

describe("cedisToPesewas", () => {
  it.each([
    ["600", 60000],
    ["600.5", 60050],
    ["600.05", 60005],
    ["1,200.00", 120000],
    ["GHS 0.10", 10],
    ["0", 0],
  ])("%s → %i", (input, pesewas) => {
    expect(cedisToPesewas(input)).toBe(pesewas);
  });

  it.each(["", "abc", "600.505", "-5", "1e3", "600."])("rejects %j", (input) => {
    expect(() => cedisToPesewas(input)).toThrow(CampError);
  });

  it("never goes through floats", () => {
    // 0.1 + 0.2 style drift would show here.
    expect(cedisToPesewas("0.29")).toBe(29);
    expect(cedisToPesewas("1234567.89")).toBe(123456789);
  });
});

describe("formatting", () => {
  it("formats pesewas as cedis", () => {
    expect(formatCedis(60000)).toBe("GHS 600.00");
    expect(formatCedis(5)).toBe("GHS 0.05");
    expect(pesewasToCedisInput(120050)).toBe("1200.50");
  });
});
