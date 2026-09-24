/**
 * The DataPallas installation API key, read from the file DataPallas writes.
 *
 * Same approach as the playgrounds (next-playground/lib/rb-config.ts, grails-playground RbUtils):
 * DataPallas' ApiKeyManager writes config/_internal/api-key.txt on first start, docker-compose.yml
 * mounts config/_internal read-only, and the key is read from there rather than copied anywhere.
 *
 * Synapse reads the very same file as its registration_shared_secret (registration_shared_secret_path
 * in config/synapse/homeserver.yaml), which is why the Matrix provisioner asks this function first.
 *
 * Server-side only. Never import this into a client component.
 */

// Must match ApiKeyManager, which writes config/_internal/api-key.txt.
const API_KEY_PATH = "/app/config/_internal/api-key.txt";

/** The key, or "" when the file is not there (config/_internal not mounted, or AI Hub run outside Docker). */
export function readDataPallasApiKey(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    return fs.readFileSync(API_KEY_PATH, "utf8").trim();
  } catch {
    return "";
  }
}
