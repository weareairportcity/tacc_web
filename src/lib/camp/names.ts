/**
 * Full names: at least two names (first name and surname), each with a
 * letter in it, so "Ama" or "Ama ." isn't enough but "Ama Mensah" and
 * "Ama K. Mensah" are. Shared by the register form, the server and the
 * attendee's "add your full name" step. No server-only imports.
 */

export const FULL_NAME_PROBLEM = "Enter your full name: first name and surname.";

export const tidyName = (raw: unknown) => String(raw ?? "").replace(/\s+/g, " ").trim();

export function isFullName(raw: unknown) {
  const words = tidyName(raw)
    .split(" ")
    .filter((w) => /\p{L}/u.test(w));
  return words.length >= 2;
}
