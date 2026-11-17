/**
 * SMS cost guard. A text made only of GSM-7 characters fits 160 characters
 * in one part (153 per part after that). One character outside that set (a
 * curly quote from an iPhone keyboard, an emoji, a Ghanaian ɛ or ɔ) switches
 * the whole text to Unicode: 70 in one part, 67 per part, so it costs two to
 * three times as much. Every text is passed through plainSms before sending.
 * Keep in step with plainSms in workers/soulwinning/src/sms.ts.
 */

const GSM =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** Allowed, but each takes two characters' room. */
const GSM_EXT = "^{}\\[~]|€";

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

/** Credits one text costs, after plainSms (which every send applies). */
export function smsPartsOf(text: string): number {
  const n = [...plainSms(text)].reduce((sum, ch) => sum + (GSM_EXT.includes(ch) ? 2 : 1), 0);
  return n <= 160 ? 1 : Math.ceil(n / 153);
}
