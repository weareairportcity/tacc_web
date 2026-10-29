/**
 * Every Commune text greets the person by first name and signs off with the
 * church. Plain characters only: a "·" or curly quote makes each SMS part
 * hold 70 characters instead of 160, so it costs more.
 */

export const SIGN_OFF = "- The Airport City Church";

export const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? "";

/** A coordinator's message, sent to each person on their own. */
export const coordinatorText = (fullName: string, message: string) => `Hi ${firstName(fullName)}, ${message.trim()} ${SIGN_OFF}`;

/** What a coordinator can write so the whole text stays within three parts. */
export const MAX_COORDINATOR_MESSAGE = 400;

/** SMS parts for plain text (GSM-7): 160 in one part, 153 per part after that. */
export const smsParts = (text: string) => (text.length <= 160 ? 1 : Math.ceil(text.length / 153));
