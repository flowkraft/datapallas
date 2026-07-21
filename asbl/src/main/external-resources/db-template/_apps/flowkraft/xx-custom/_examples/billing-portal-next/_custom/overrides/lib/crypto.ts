import { createHash } from "crypto";

// SHA-256(salt + password) hex — same scheme + salt as the Grails AuthService, so hashes match.
const SALT = "bp-demo-salt-v1";

export function hashPassword(raw: string): string {
  return createHash("sha256").update(SALT + (raw ?? "")).digest("hex");
}
