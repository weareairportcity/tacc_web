import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Subdomain routing plus admin session handling.
 *
 * soulwinning.theairportcitychurch.com/* serves the /1909 app, so the outreach
 * lives on its own host while staying one deployment.
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

export async function proxy(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").split(":")[0];
  const { pathname } = request.nextUrl;

  // ── Subdomain → /1909 ────────────────────────────────────────────────
  if (SOULWINNING_HOSTS.has(hostname)) {
    const alreadyMapped =
      pathname.startsWith("/1909") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      pathname === "/favicon.ico";

    if (!alreadyMapped) {
      const url = request.nextUrl.clone();
      url.pathname = `/1909${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // ── Admin session refresh ────────────────────────────────────────────
  // Everything else — the counter, the projector, the field app — skips this.
  const needsSession = pathname.startsWith("/admin") || pathname.startsWith("/1909/admin");
  if (!needsSession) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Gate the admin areas; each page still checks its own role.
  const isLogin = pathname.startsWith("/admin/login");
  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  // No redirect away from the login page when already signed in: that page is
  // also the portal chooser, and bouncing a signed-in admin straight to
  // /admin would put Soul Winning and Songs permanently out of reach.

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
