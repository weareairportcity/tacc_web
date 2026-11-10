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

/**
 * expressPay's fee, passed on so the church receives the full instalment.
 * Must match feeFor in workers/soulwinning/src/camp.ts, which charges it.
 */
export function feeFor(amountPesewas: number, feeBps: number): number {
  if (feeBps <= 0) return 0;
  return Math.ceil((amountPesewas * 10000) / (10000 - feeBps)) - amountPesewas;
}

export type PayMethod = "card" | "momo";

/**
 * The fee rate for a way of paying. MoMo charged from Commune has its own
 * rate. On expressPay's page the payer can still pick either, so the higher
 * of the two applies there: the payer always covers the fee, never the
 * church. Must match rateFor in workers/soulwinning/src/camp.ts.
 */
export function rateFor(method: PayMethod, camp: { fee_bps: number; momo_fee_bps: number }, momoDirect: boolean): number {
  return momoDirect && method === "momo" ? camp.momo_fee_bps : Math.max(camp.fee_bps, camp.momo_fee_bps);
}

export type MomoNetwork = "mtn" | "telecel" | "airteltigo";

export const MOMO_NETWORKS: { id: MomoNetwork; label: string }[] = [
  { id: "mtn", label: "MTN" },
  { id: "telecel", label: "Telecel" },
  { id: "airteltigo", label: "AirtelTigo" },
];

/** Ghana's number ranges, for guessing the network. People who moved networks can change it. */
const PREFIXES: Record<string, MomoNetwork> = {
  "24": "mtn", "25": "mtn", "53": "mtn", "54": "mtn", "55": "mtn", "59": "mtn",
  "20": "telecel", "50": "telecel",
  "26": "airteltigo", "27": "airteltigo", "56": "airteltigo", "57": "airteltigo",
};

/** "024 412 3456" or "+233 24 412 3456" → "233244123456", or null. */
export function momoNumber(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  const n = digits.startsWith("233") ? digits : digits.startsWith("0") ? `233${digits.slice(1)}` : digits.length === 9 ? `233${digits}` : digits;
  return /^233[25]\d{8}$/.test(n) ? n : null;
}

export function guessNetwork(input: string): MomoNetwork | null {
  const n = momoNumber(input);
  return n ? (PREFIXES[n.slice(3, 5)] ?? null) : null;
}
