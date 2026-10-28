import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Subdomain routing plus admin session handling.
 *
 * soulwinning.theairportcitychurch.com/* serves the current campaign (/gic), so the outreach
 * lives on its own host while staying one deployment.
 *
 * commune.theairportcitychurch.com is Commune, the camp app: its home is the
 * camps list, commune…/<camp-slug> is a short link to a camp, /admin opens
 * the coordinators' side and /leaders the leaders' side. The two sides are
 * kept apart: each request is marked with its side (AREA) and only that
 * side's sign-in counts on it, so one phone can be signed in to both. www…/camps and www…/admin/camp move there for
 * good (set COMMUNE_REDIRECT=0 to pause that, e.g. if the domain ever breaks).
 *
 * The Supabase session work is deliberately scoped to /admin only. It costs a
 * network round trip per request, and the public counter is the one page that
 * may be open on hundreds of phones and a projector at once — it must not pay
 * for auth it never uses.
 */

const SOULWINNING_HOSTS = new Set([
  "soulwinning.theairportcitychurch.com",
  "www.soulwinning.theairportcitychurch.com",
  "soulwinning.localhost",
]);

const COMMUNE_HOSTS = new Set(["commune.theairportcitychurch.com", "commune.localhost"]);
const COMMUNE_ORIGIN = "https://commune.theairportcitychurch.com";

/** Which side of Commune a request is for. Always set here, so a visitor can't choose it. Read by currentStaff. */
const AREA = "x-commune-area";
const LEADER_COOKIE = "camp_leader";
const isLeaders = (pathname: string) => pathname === "/leaders" || pathname.startsWith("/leaders/");

/**
 * The leaders' side: commune…/leaders/<camp>/… shows the same pages as
 * /admin/camp/<camp>/…, marked as the leaders' side so only a leader code
 * counts there. commune…/leaders itself is their sign-in.
 */
function leaderArea(request: NextRequest, pathname: string) {
  const headers = new Headers(request.headers);
  headers.set(AREA, "leader");
  const url = request.nextUrl.clone();
  if (pathname !== "/leaders" && !request.cookies.has(LEADER_COOKIE)) {
    url.pathname = "/leaders";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  url.pathname = pathname === "/leaders" ? "/admin/camp/leaders" : `/admin/camp${pathname.slice("/leaders".length)}`;
  return NextResponse.rewrite(url, { request: { headers } });
}

export async function proxy(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").split(":")[0];
  const { pathname } = request.nextUrl;

  // ── Subdomain → /1909 ────────────────────────────────────────────────
  if (SOULWINNING_HOSTS.has(hostname)) {
    const alreadyMapped =
      pathname.startsWith("/gic") ||
      pathname.startsWith("/1909") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      pathname === "/favicon.ico";

    if (!alreadyMapped) {
      const url = request.nextUrl.clone();
      url.pathname = `/gic${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // ── Commune, the camp app ────────────────────────────────────────────
  if (COMMUNE_HOSTS.has(hostname)) {
    if (pathname === "/admin") return NextResponse.redirect(new URL("/admin/camp", request.url));
    const passThrough =
      pathname.startsWith("/camps") ||
      isLeaders(pathname) ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      /\.[a-z0-9]+$/i.test(pathname);
    if (!passThrough) {
      const url = request.nextUrl.clone();
      url.pathname = `/camps${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  } else if (
    process.env.COMMUNE_REDIRECT !== "0" &&
    (pathname === "/camps" || pathname.startsWith("/camps/") || pathname === "/admin/camp" || pathname.startsWith("/admin/camp/") || isLeaders(pathname))
  ) {
    return NextResponse.redirect(`${COMMUNE_ORIGIN}${pathname}${request.nextUrl.search}`, 308);
  }

  if (isLeaders(pathname)) return leaderArea(request, pathname);

  // ── Admin session refresh ────────────────────────────────────────────
  // Supabase Auth for /admin (bookings + songs). Soul winning (/gic/admin)
  // keeps its own admin-code sign-in and does not use this session.
  const needsSession = pathname.startsWith("/admin");
  if (!needsSession) {
    return NextResponse.next();
  }

  // Everything under /admin is the coordinators' side (see AREA).
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set(AREA, "coordinator");
    return NextResponse.next({ request: { headers } });
  };
  let supabaseResponse = next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          supabaseResponse = next();
          supabaseResponse.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          supabaseResponse = next();
          supabaseResponse.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Gate the admin areas; each page still checks its own role. Commune's
  // coordinator app has its own sign-in page, and its app manifest and
  // service worker must load without one.
  const isCommune = pathname === "/admin/camp" || pathname.startsWith("/admin/camp/");
  // The leaders' sign-in used to live here.
  if (pathname === "/admin/camp/leaders") return NextResponse.redirect(new URL(`/leaders${request.nextUrl.search}`, request.url));
  const isLogin = pathname.startsWith("/admin/login") || pathname === "/admin/camp/sign-in";
  const isPublicFile = pathname === "/admin/camp/manifest.webmanifest" || pathname === "/admin/camp/sw.js";
  // A leader with no coordinator sign-in opening a coordinator link (a pass scanned by the camera
  // app, an old bookmark) goes to the same page on the leaders' side.
  if (!user && /^\/admin\/camp\/[0-9a-f-]{36}(\/|$)/.test(pathname) && request.cookies.has(LEADER_COOKIE)) {
    const response = NextResponse.redirect(new URL(`/leaders${pathname.slice("/admin/camp".length)}${request.nextUrl.search}`, request.url));
    // Leader sessions from before /leaders were kept at this path; the current one is at "/".
    response.cookies.set({ name: LEADER_COOKIE, value: "", path: "/admin/camp", maxAge: 0 });
    return response;
  }
  if (!user && !isLogin && !isPublicFile) {
    const url = request.nextUrl.clone();
    url.pathname = isCommune ? "/admin/camp/sign-in" : "/admin/login";
    url.search = isCommune && pathname !== "/admin/camp" ? `?next=${encodeURIComponent(pathname + request.nextUrl.search)}` : "";
    return NextResponse.redirect(url);
  }

  // No redirect away from the login page when already signed in: that page is
  // also the portal chooser, and bouncing a signed-in admin straight to
  // /admin would put Soul Winning and Songs permanently out of reach.

  return supabaseResponse;
}

// Runs only where it has work to do: every path on the soul winning subdomain
// (for the /1909 rewrite) and the Supabase admin area. It used to match nearly
// every request on the site, which made each page view and API call pay for a
// proxy invocation it didn't need.
export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
      has: [{ type: "header", key: "host", value: "(?:www\\.)?soulwinning\\..+" }],
    },
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      has: [{ type: "header", key: "host", value: "commune\\..+" }],
    },
    "/camps/:path*",
    "/admin/:path*",
    "/leaders",
    "/leaders/:path*",
  ],
};
