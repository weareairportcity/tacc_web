/**
 * What kind of device a user agent string is, in plain words: "Android 15 · Chrome",
 * "iPhone · iOS 18 · Safari". Shared by the sign-in log (server) and the visit counts
 * (browser). iPhones never say which model they are, and Chrome on Android hides its
 * real version and model here; the page asks Chrome for those separately.
 */

export type Device = { device: "phone" | "tablet" | "computer" | ""; os: string; osVersion: string; browser: string };

export function parseUserAgent(ua: string): Device {
  const s = String(ua ?? "");
  let os = "";
  let osVersion = "";
  let m: RegExpMatchArray | null;
  if ((m = s.match(/(iPhone|iPad|iPod).*? OS (\d+)/))) {
    os = "iOS";
    osVersion = m[2];
  } else if ((m = s.match(/Android (\d+)(; K\))?/))) {
    os = "Android";
    // Chrome now always says "Android 10; K", whatever the phone runs.
    osVersion = m[2] ? "" : m[1];
  } else if (/Windows NT/.test(s)) os = "Windows";
  else if (/Mac OS X/.test(s)) {
    // Every Mac browser says 10_15_7 now, so there's no version to read. iPads ask for the
    // desktop site and say they're Macs too; a touch screen gives them away in the page.
    os = "macOS";
  } else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Linux/.test(s)) os = "Linux";

  const browser = /EdgA?\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /SamsungBrowser/.test(s)
        ? "Samsung Internet"
        : /FBAN|FBAV|Instagram|WhatsApp/.test(s)
          ? "In-app"
          : /CriOS|Chrome\//.test(s)
            ? "Chrome"
            : /FxiOS|Firefox\//.test(s)
              ? "Firefox"
              : /Safari\//.test(s)
                ? "Safari"
                : "";

  const device = /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s))
    ? "tablet"
    : /iPhone|iPod|Mobile|Android/.test(s)
      ? "phone"
      : s
        ? "computer"
        : "";
  return { device, os, osVersion, browser };
}

/** "Android 15 · Chrome" */
export const describeDevice = (d: Device) =>
  [d.os === "iOS" ? `${d.device === "tablet" ? "iPad" : "iPhone"} · iOS ${d.osVersion}` : [d.os, d.osVersion].filter(Boolean).join(" "), d.browser]
    .filter(Boolean)
    .join(" · ");
