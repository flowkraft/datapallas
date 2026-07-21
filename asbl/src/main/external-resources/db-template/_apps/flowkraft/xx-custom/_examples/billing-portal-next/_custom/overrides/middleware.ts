import { NextRequest, NextResponse } from "next/server";
import { redirectTo } from "@/lib/http";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Edge middleware. /admin requires ADMIN; /portal requires any session, EXCEPT /portal/pay, whose
 * authorization is the pay token itself (see lib/db/scoped.ts).
 *
 * It imports lib/session, not lib/auth: lib/auth reaches for next/headers and the database, and
 * neither exists in the edge runtime. lib/session touches only Web Crypto, which both runtimes have.
 *
 * This is a CONVENIENCE gate, not the authorization boundary — it decides where to send a browser,
 * nothing more. Everything behind it asserts for itself: the admin pages via requireAdmin(), the
 * portal pages via the scoped accessors, the server actions and /api/pay via their own checks. That
 * is deliberate. Next's own guidance is that middleware must not be the only gate, /api is not even
 * in the matcher below, and CVE-2025-29927 lets a single request header skip middleware outright on
 * the 15.1.6 this blueprint pins — so anything that were gated ONLY here would be gated by nothing.
 */
function session(req: NextRequest) {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

// Layouts are server components: they render before the URL is knowable to them, so forward it as a
// request header. (portal)/layout.tsx needs it to render /portal/pay chrome-free. This is the twin
// of the Grails layout reading actionName. It must ride along on EVERY pass-through below — a bare
// NextResponse.next() would drop the header and the checkout would grow a nav again.
function proceed(req: NextRequest, pathname: string) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const s = await session(req);

  // 307, not the 303 the form posts use: these are GET navigations being bounced, and 307 preserves
  // the method rather than rewriting it to GET (which for a GET is the same thing, but says so).
  if (pathname.startsWith("/admin")) {
    if (s?.role === "ADMIN") return proceed(req, pathname);
    return redirectTo(req, "/login", 307);
  }

  if (pathname.startsWith("/portal")) {
    if (pathname.startsWith("/portal/pay")) return proceed(req, pathname);
    if (s?.userId) return proceed(req, pathname);
    return redirectTo(req, "/login", 307);
  }

  return proceed(req, pathname);
}

export const config = { matcher: ["/admin/:path*", "/portal/:path*"] };
