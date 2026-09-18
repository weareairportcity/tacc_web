/** Short codes members use to open their account on another phone. */

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const LOGIN_CODE_LENGTH = 4;

export function generateLoginCode(): string {
  const bytes = new Uint8Array(LOGIN_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function normalizeLoginCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, LOGIN_CODE_LENGTH);
}

export async function uniqueLoginCode(existing: Iterable<string>): Promise<string> {
  const taken = new Set(
    Array.from(existing, (code) => normalizeLoginCode(code)).filter((code) => code.length === LOGIN_CODE_LENGTH)
  );

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateLoginCode();
    if (!taken.has(code)) return code;
  }

  return generateLoginCode();
}
