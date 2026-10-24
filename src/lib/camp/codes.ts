import { createHmac } from "node:crypto";

/**
 * Attendee sign-in codes. Like soul winning's login code, but 8 characters
 * (32^8 ≈ 10^12) because here it is the only credential. Only an HMAC keyed
 * with CAMP_SECRET is stored, so a copy of the database can't be used to
 * guess codes offline.
 */

// No 0/O or 1/I. 32 symbols, so byte % 32 is unbiased.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 8;

export function campSecret() {
  const secret = process.env.CAMP_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new Error("CAMP_SECRET must be at least 32 characters");
  return secret;
}

export function generateCode(length = CODE_LENGTH): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** "abcd-efgh", "ABCD EFGH" → "ABCDEFGH" */
export function normalizeCode(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
}

/** "ABCDEFGH" → "ABCD-EFGH", easier to read out and copy. */
export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * Roommate group codes: 6 characters (32^6 ≈ 10^9), shared openly between
 * friends, so stored as they are. Joining is rate-limited.
 */
export const GROUP_CODE_LENGTH = 6;
export const generateGroupCode = () => generateCode(GROUP_CODE_LENGTH);
/** "7K4F2Q" → "7K4-F2Q" */
export const formatGroupCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`;

export function hashCode(code: string): string {
  return createHmac("sha256", campSecret()).update(`camp-code.${normalizeCode(code)}`).digest("hex");
}
