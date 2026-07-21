import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, bpAppUser } from "./db";
import { hashPassword } from "./crypto";
import { verifySession, type Session } from "./session";

// The cookie's shape + signing lives in ./session, which the EDGE middleware also imports and which
// therefore may not touch next/headers or the db. Re-exported so callers have one place to import
// from, exactly as before.
export { SESSION_COOKIE, signSession, verifySession } from "./session";
export type { Session } from "./session";

/**
 * The signed-in user, or null. Returns null for a cookie that was tampered with, so every caller
 * that reads .customerId / .role is standing on a claim the server actually made.
 */
export async function getSession(): Promise<Session | null> {
  return verifySession((await cookies()).get("bp_session")?.value);
}

export function authenticate(username: string, password: string): Session | null {
  const u = db.select().from(bpAppUser).where(eq(bpAppUser.username, username)).all()[0];
  if (!u || u.passwordHash !== hashPassword(password)) return null;
  return { userId: u.id, username: u.username, role: u.role, customerId: u.customerId ?? null };
}
