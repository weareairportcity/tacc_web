import type { AppState } from "./app-first";

/** Where someone stands with the app, in words (safe for the browser). */
export const APP_STATE_WORDS: Record<AppState, string> = {
  on: "Notifications on",
  installed: "App, notifications off",
  texts: "Texts only",
  none: "Not set up",
};
