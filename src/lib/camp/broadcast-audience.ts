import type { AppState } from "./app-first";
import type { RegistrationStatus } from "./types";

/** Who a message to many is for (Texts). Shared by the page and the server. */
export const AUDIENCES = ["all", "owing", "paid", "noapp"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_WORDS: Record<Audience, string> = {
  all: "Everyone registered",
  owing: "Still to pay",
  paid: "Paid in full",
  noapp: "Not on the app yet",
};

export function inAudience(r: { status: RegistrationStatus; app: AppState }, audience: Audience) {
  if (audience === "owing") return r.status === "registered" || r.status === "partially_paid";
  if (audience === "paid") return r.status === "fully_paid";
  if (audience === "noapp") return r.app !== "on";
  return true;
}
