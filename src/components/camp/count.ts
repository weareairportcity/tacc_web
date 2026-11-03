/**
 * Commune's visit counts, the part the rest of the app talks to (Collector.tsx sends them).
 * Totals, not people: a screen is its address with names and ids taken out.
 */

type Bus = { taps: number[] };
const bus: Bus = { taps: [] };

/** How long a button's action took (useOneAtATime), for "how slow do taps feel". */
export function noteTapTime(ms: number) {
  if (bus.taps.length < 200) bus.taps.push(ms);
}
export const takeTapTimes = () => bus.taps.splice(0);

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Pages that aren't a camp: commune…/privacy, /camps, /terms… */
const NOT_A_CAMP = new Set(["", "camps", "privacy", "terms", "cookies", "admin", "leaders"]);

/**
 * "/camps/youth-camp-2026/pay/aB3…" → { screen: "/:camp/pay/:token", camp: "youth-camp-2026" };
 * "/admin/camp/<id>/people" → { screen: "/admin/:camp/people", camp: "<id>" }.
 */
export function screenOf(pathname: string): { screen: string; camp: string } {
  let path = pathname.replace(/\/+$/, "") || "/";
  let camp = "";
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/(admin\/camp|leaders)\/([0-9a-f-]{36})(\/.*)?$/i))) {
    camp = m[2].toLowerCase();
    path = `/${m[1] === "leaders" ? "leaders" : "admin"}/:camp${m[3] ?? ""}`;
  } else if (!path.startsWith("/admin") && !path.startsWith("/leaders")) {
    const parts = path.replace(/^\/camps(?=\/|$)/, "").split("/").filter(Boolean);
    if (parts.length && !NOT_A_CAMP.has(parts[0])) {
      camp = parts[0].toLowerCase();
      path = `/:camp${parts.length > 1 ? `/${parts.slice(1).join("/")}` : ""}`;
    } else path = `/${parts.join("/")}`;
  }
  const screen = path
    .replace(UUID, ":id")
    .replace(/\/[A-Za-z0-9_-]{16,}(?=\/|$)/g, "/:token")
    .replace(/\d{3,}/g, ":n")
    .slice(0, 100);
  return { screen, camp };
}
