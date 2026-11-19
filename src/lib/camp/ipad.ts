/**
 * iPads ask for the computer version of sites and say they're Macs, so the
 * server can't tell them apart from a Mac. The browser can (a "Mac" with a
 * touchscreen): IPadMark sets this cookie, and the server then treats the
 * device as an iPad, so the Home Screen app and notifications are asked for
 * just as on a phone. No server-only imports.
 */
export const IPAD_COOKIE = "cm_ipad";

/** The user agent the app-first checks should see: a marked "Mac" counts as an iPad. */
export const agentFor = (userAgent: string, ipadCookie: string | undefined) =>
  ipadCookie === "1" && /Macintosh/.test(userAgent) ? `${userAgent} iPad` : userAgent;

/**
 * Apple devices older than iOS / iPadOS 16.4 can't get Home Screen app
 * notifications at all. iPhones say "OS 16_3"; iPads asking for the computer
 * site only say "Version/16.3".
 */
export function tooOldForAppNotifications(userAgent: string) {
  if (!/iPhone|iPad|iPod/.test(userAgent)) return false;
  const m = userAgent.match(/OS (\d+)_(\d+)/) ?? userAgent.match(/Version\/(\d+)\.(\d+)/);
  if (!m) return false;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major < 16 || (major === 16 && minor < 4);
}

/**
 * A team member on a device that can't do Commune Team ("My device can't do
 * this") is let through on that device only: a cookie, so their phone is
 * still asked if it can.
 */
export const TEAM_NO_APP_COOKIE = "cm_team_noapp";
