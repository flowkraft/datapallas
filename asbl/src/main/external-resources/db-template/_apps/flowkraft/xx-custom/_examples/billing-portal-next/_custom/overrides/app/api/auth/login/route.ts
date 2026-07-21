import { NextRequest } from "next/server";
import { authenticate, signSession, SESSION_COOKIE } from "@/lib/auth";
import { redirectTo } from "@/lib/http";

// The login form posts here. On success set the session cookie + redirect to /admin or /portal;
// on failure bounce back to /login?error=1.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const username = String(form.get("username") || "");
  const password = String(form.get("password") || "");

  const session = authenticate(username, password);
  if (!session) {
    return redirectTo(req, "/login?error=1");
  }

  const dest = session.role === "ADMIN" ? "/admin" : "/portal";
  const res = redirectTo(req, dest);
  // SIGNED — the cookie carries the role and customerId every gate on this stack believes, so it
  // has to be unforgeable. httpOnly alone only stops scripts READING it, never the client writing it.
  res.cookies.set(SESSION_COOKIE, await signSession(session), { httpOnly: true, path: "/", sameSite: "lax" });
  return res;
}
