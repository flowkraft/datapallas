import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Redirect to `path` on the host the visitor actually used. Build EVERY redirect with this — never
 * with NextResponse.redirect(new URL(path, req.url)).
 *
 * NextResponse.redirect() demands an absolute URL, and the obvious way to get one — resolving
 * against req.url — is wrong here. This app ships `output: "standalone"` and its Dockerfile starts
 * the server with HOSTNAME=0.0.0.0, which is the host Next then reports back in req.url. So the
 * browser was told to go to http://0.0.0.0:3000/admin and refused: 0.0.0.0 means "every local
 * interface" to a LISTENING socket, it is not an address a client can dial, and Chromium rejects it
 * outright with net::ERR_ADDRESS_INVALID. Every sign-in died there — including the deliberate
 * bad-password one, which redirects just the same.
 *
 * The Host header is the answer: it carries the host:port the CLIENT addressed (localhost:8501 for
 * the E2E, a LAN address or a real domain in the wild), which is exactly where the redirect has to
 * land. The x-forwarded-* variants are consulted first so this also holds behind a reverse proxy.
 *
 * The Grails twin never had this problem: redirect(action:'index') is relative, so the browser
 * resolves it against the URL it asked for and the question never arises.
 */
export function redirectTo(req: NextRequest, path: string, status: 303 | 307 = 303) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  // No Host header at all (an HTTP/1.0 client, or a bare socket probe) — fall back to req.url so
  // this degrades to the previous behaviour instead of throwing on `new URL(path, null)`.
  const base = host ? `${proto}://${host}` : req.url;
  return NextResponse.redirect(new URL(path, base), { status });
}
