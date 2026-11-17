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
