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

/**
 * Sign-in codes are 12 digits: phones open the number pad, and they read out like a phone
 * number. 10^12 is as hard to guess as the 8-character codes given out before, which still work.
 */
export const SIGN_IN_DIGITS = 12;
const OLD_CODE_LENGTH = CODE_LENGTH;

export function generateSignInCode(): string {
  let out = "";
  while (out.length < SIGN_IN_DIGITS) {
    // 250 is the largest multiple of 10 under 256, so every digit is equally likely.
    for (const b of crypto.getRandomValues(new Uint8Array(SIGN_IN_DIGITS))) if (b < 250 && out.length < SIGN_IN_DIGITS) out += String(b % 10);
  }
  return out;
}

/** A typed code that could be someone's: 12 digits, or one of the older 8-character codes. */
export const looksLikeSignInCode = (normalized: string) =>
  (normalized.length === SIGN_IN_DIGITS && /^\d+$/.test(normalized)) || normalized.length === OLD_CODE_LENGTH;

/** "483122071693" → "4831 2207 1693"; older codes "ABCDEFGH" → "ABCD-EFGH". */
export const formatCode = (code: string) =>
  code.length === SIGN_IN_DIGITS ? `${code.slice(0, 4)} ${code.slice(4, 8)} ${code.slice(8)}` : `${code.slice(0, 4)}-${code.slice(4)}`;

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
