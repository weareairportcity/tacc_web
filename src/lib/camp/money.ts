import { CampError } from "./types";

/**
 * Cedis typed by a person ("600", "600.5", "1,200.00") to integer pesewas.
 * Parsed as a string, never through a float, so 0.1 + 0.2 problems can't creep in.
 */
export function cedisToPesewas(input: string): number {
  const cleaned = input.trim().replace(/^GHS\s*/i, "").replace(/^₵\s*/, "").replace(/,/g, "");
  const match = cleaned.match(/^(\d{1,7})(?:\.(\d{1,2}))?$/);
  if (!match) throw new CampError(`"${input}" is not an amount in cedis, e.g. 600 or 600.50.`);
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** 60000 → "GHS 600.00" */
export function formatCedis(pesewas: number): string {
  const cedis = Math.floor(pesewas / 100).toLocaleString("en-GH");
  return `GHS ${cedis}.${String(pesewas % 100).padStart(2, "0")}`;
}

/** 60000 → "600.00", for an edit field. */
export function pesewasToCedisInput(pesewas: number): string {
  return `${Math.floor(pesewas / 100)}.${String(pesewas % 100).padStart(2, "0")}`;
}
