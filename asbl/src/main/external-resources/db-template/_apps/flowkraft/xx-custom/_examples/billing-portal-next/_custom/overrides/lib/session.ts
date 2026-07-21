/**
 * The session cookie's format — signing and verification.
 *
 * Split out of lib/auth.ts because the EDGE middleware needs it and lib/auth.ts reaches for
 * next/headers + the database, neither of which exists in the edge runtime. Nothing in here touches
 * either: Web Crypto and TextEncoder are the two things both runtimes agree on.
 *
 * WHY THIS IS SIGNED. The cookie used to be plain btoa(JSON.stringify(session)), read back with
 * atob + JSON.parse and trusted. httpOnly stops a page script READING it; it does nothing to stop
 * the client SETTING it, so anyone could paste
 *     bp_session = base64({"userId":1,"role":"ADMIN","customerId":null})
 * and be an administrator, with no account. Every gate on this stack — the middleware, the portal's
 * ownership checks, the scoped reads in lib/db/scoped.ts — believes this cookie, so none of them
 * meant anything until it was authenticated. In particular, filtering rows by session.customerId is
 * worthless if the visitor picks their own customerId: the filter faithfully returns that customer's
 * data.
 *
 * The Grails twin never had this problem and needs no equivalent: its session lives server-side in
 * the HttpSession, and the cookie is an opaque JSESSIONID that carries no claims at all. This file
 * is what buys Next the same guarantee — the payload is public (as it is in a JWT), but it cannot be
 * altered without the secret.
 */

export interface Session {
  userId: number;
  username: string;
  role: string; // ADMIN | CUSTOMER
  customerId: number | null;
}

export const SESSION_COOKIE = "bp_session";

/**
 * Signing key. A real install never uses the fallback: app-seed.groovy generates 32 random bytes per
 * scaffold into the app's .env, which the compose passes in as BP_SESSION_SECRET. That matters — a
 * key shipped in this file would be a PUBLISHED signing key, and a published key validates a forged
 * `{"role":"ADMIN"}` cookie exactly as happily as a real login, which is the whole hole this file
 * exists to close. The fallback is only so the app still boots when run outside Docker.
 *
 * It must come from the ENVIRONMENT, never from a default computed in this module. The cookie is
 * signed by a Node route handler and verified by the EDGE middleware — two separate module
 * instances. Anything per-instance (a random value, a boot timestamp) hands them different keys, and
 * then real sessions fail to verify right alongside forged ones: the app cannot log anyone in at all.
 * A `|| \`dev-only-${crypto.randomUUID()}\`` fallback did exactly that here, and the symptom was the
 * correct admin password bouncing straight back to /login.
 */
const SECRET = process.env.BP_SESSION_SECRET || "bp-demo-session-secret-CHANGE-ME";

const enc = new TextEncoder();

// base64url — a cookie value may not contain +, / or =, and the standard base64 alphabet has all three.
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

let keyPromise: Promise<CryptoKey> | null = null;
const key = () =>
  (keyPromise ??= crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]));

/** `<base64url(payload)>.<base64url(hmac)>` — the payload is readable, but not rewritable. */
export async function signSession(s: Session): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(s)));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(payload)));
  return `${payload}.${b64url(mac)}`;
}

/**
 * The signed cookie back to a Session, or null if it was absent, malformed, or tampered with.
 * crypto.subtle.verify does the comparison, so it is constant-time — a hand-rolled `mac === expected`
 * would leak the signature a byte at a time to anyone willing to time the responses.
 */
export async function verifySession(v?: string): Promise<Session | null> {
  if (!v) return null;
  const dot = v.lastIndexOf(".");
  if (dot < 1) return null;
  const [payload, mac] = [v.slice(0, dot), v.slice(dot + 1)];
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), unb64url(mac), enc.encode(payload));
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(unb64url(payload))) as Session;
  } catch {
    return null; // malformed base64/JSON reads exactly like a bad signature: no session.
  }
}
