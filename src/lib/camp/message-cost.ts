import { smsPartsOf } from "@/lib/sms-plain";
import type { AppState } from "./app-first";
import { coordinatorText } from "./sms";

/** How a coordinator's message goes (see broadcast.ts): app first, important (text and app), or text only. */
export type Delivery = "app" | "both" | "text";

/** Who gets a notification, who gets a text, and the exact credits, before anything is sent. */
export function messageCost(people: { first: string; app?: AppState }[], message: string, how: Delivery) {
  const byApp = how === "text" ? [] : people.filter((p) => p.app === "on");
  const byText = how === "app" ? people.filter((p) => p.app !== "on") : people;
  const credits = byText.reduce((s, p) => s + smsPartsOf(coordinatorText(p.first, message || "…")), 0);
  return { byApp: byApp.length, byText: byText.length, credits };
}
