// DataPallas API configuration.
//
// TWO CREDENTIALS, AND THE DIFFERENCE MATTERS
//
//   RB_API_KEY  — this application's own long-lived credential. It authenticates as an
//                 ADMINISTRATOR. Server-side only: note there is no NEXT_PUBLIC_ prefix, because
//                 Next inlines any NEXT_PUBLIC_ value straight into the browser bundle, where every
//                 visitor can read it.
//
//   embed token — short-lived (one hour), scoped to a single report, minted per page render by
//                 mintEmbedToken() below. This is the only credential that may appear in HTML.
//
// The visitor authenticates with nothing and never sees a login: this app signs on their behalf.
// That is the point of signed embedding, and why these demo portals stay friction-free even when
// DataPallas Server has authentication switched on.

/**
 * This application's own credential, read from the DataPallas installation that docker-compose
 * mounts read-only at /app/config.
 *
 * Read from the file rather than copied into an environment variable: both applications run on the
 * same machine, so the file is the single source of truth and there is nothing to keep in sync. The
 * RB_API_KEY environment variable still wins when set, for deployments that are not co-located.
 *
 * Server-side only. Never import this into a client component.
 */
function readApiKey(): string {
  if (process.env.RB_API_KEY) return process.env.RB_API_KEY

  try {
    // Must match ApiKeyManager, which writes config/_internal/api-key.txt.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs")
    const key = fs.readFileSync("/app/config/_internal/api-key.txt", "utf8").trim()
    if (key) return key
  } catch {
    console.warn(
      "[rb-config] No DataPallas API key at /app/config/_internal/api-key.txt — is config/ " +
        "mounted? Falling back to the dev key, which a real server will reject.",
    )
  }

  // Matches the dev server's -DAPI_KEY=123. Useless against a packaged server, which generates a
  // random key — hence the warning above.
  return "123"
}

const RB_API_KEY = readApiKey()

export const rbConfig = {
  // Safe for the browser: it is only a URL.
  apiBaseUrl: process.env.NEXT_PUBLIC_RB_API_BASE_URL || "http://localhost:9090/api",
}

/**
 * Mint a token that lets the embedded components on this page read ONE report.
 *
 * Call from a Server Component or Route Handler — never from the browser, since it uses the API key.
 *
 * Returns "" when DataPallas is unreachable or does not require a token (DataPallas Desktop), so a
 * page still renders instead of failing: the components then simply send no token.
 */
export async function mintEmbedToken(reportId: string): Promise<string> {
  if (!reportId) return ""

  const cached = tokenCache.get(reportId)
  if (cached && cached.expiresAtMs > Date.now()) return cached.token

  try {
    const response = await fetch(`${rbConfig.apiBaseUrl}/embed/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": RB_API_KEY },
      body: JSON.stringify({ reportId }),
      cache: "no-store",
    })

    if (!response.ok) return ""

    const body = (await response.json()) as { token?: string; expiresInSeconds?: number }
    if (!body.token) return ""

    // Re-mint a few minutes early so a visitor never receives a token that is about to expire.
    const ttlSeconds = body.expiresInSeconds ?? 3600
    tokenCache.set(reportId, {
      token: body.token,
      expiresAtMs: Date.now() + Math.max(ttlSeconds - 300, 60) * 1000,
    })

    return body.token
  } catch {
    return ""
  }
}

const tokenCache = new Map<string, { token: string; expiresAtMs: number }>()

/**
 * Server-to-server call to the DataPallas API, authenticated with this application's API key.
 *
 * Server-side only — it carries the administrator credential. Anything the browser needs should go
 * through an embed token or a Route Handler in this app.
 */
export async function rbFetch(endpoint: string, options?: RequestInit) {
  const url = `${rbConfig.apiBaseUrl}${endpoint}`
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": RB_API_KEY,
    ...options?.headers,
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    throw new Error(`DataPallas API error: ${response.statusText}`)
  }

  return response.json()
}
