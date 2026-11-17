/**
 * GSM-7 only: one curly quote, emoji or ɛ/ɔ makes a text Unicode, 70 characters
 * a part instead of 160. Copy of src/lib/sms-plain.ts; keep the two in step.
 */
const GSM =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** Allowed, but each takes two characters' room. */
export const GSM_EXT = "^{}\\[~]|€";

const SWAP: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "`": "'", "´": "'",
  "“": '"', "”": '"', "„": '"', "″": '"', "«": '"', "»": '"',
  "–": "-", "—": "-", "‐": "-", "‑": "-", "−": "-",
  "…": "...", "•": "-", "·": "-",
  " ": " ", " ": " ", " ": " ", "\t": " ",
  "ɛ": "e", "Ɛ": "E", "ɔ": "o", "Ɔ": "O", "ŋ": "n", "Ŋ": "N", "ƒ": "f", "Ʋ": "V", "ʋ": "v",
  "₵": "GHS ", "¢": "c", "©": "(c)", "®": "(R)", "™": "TM", "°": " degrees", "×": "x", "÷": "/",
};

const isGsm = (ch: string) => GSM.includes(ch) || GSM_EXT.includes(ch);

/** The same text in plain GSM-7 characters: quotes straightened, accents and emoji dropped. */
export function plainSms(text: string): string {
  let out = "";
  for (const ch of text) {
    if (isGsm(ch)) out += ch;
    else if (SWAP[ch] !== undefined) out += SWAP[ch];
    else if (/[\p{Extended_Pictographic}‍︎️⃣]|\p{Emoji_Modifier}/u.test(ch)) continue;
    else {
      const bare = ch.normalize("NFD").replace(/\p{M}/gu, "");
      out += bare && [...bare].every(isGsm) ? bare : "?";
    }
  }
  // Dropped emoji can leave double spaces behind.
  return out.replace(/ {2,}/g, " ").replace(/ +([.,!?])/g, "$1").trim();
}
