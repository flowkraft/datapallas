"use client"

import { useEffect, useState } from "react"

/**
 * Fetches a short-lived embed token for one report, for use in an `embed-token` attribute.
 *
 * The token is minted by this app's own server (see app/api/embed-token/route.ts) so the DataPallas
 * API key never reaches the browser. The visitor signs in to nothing — the app signs on their behalf.
 *
 * Returns null while the token is still being fetched. Render the components only once it is not
 * null: they read `embed-token` once, when they mount, so a component rendered before the token
 * arrives calls DataPallas without one and never retries (a DataPallas Server answers 401).
 *
 * Once settled it is the token, or "" if DataPallas needs no token (DataPallas Desktop) or is
 * unreachable. The components treat an empty attribute as "send nothing", which is exactly the
 * right behaviour in both of those cases.
 */
export function useEmbedToken(reportId: string): string | null {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    if (!reportId) {
      setToken("")
      return
    }

    let active = true

    fetch(`/api/embed-token?reportId=${encodeURIComponent(reportId)}`)
      .then((res) => (res.ok ? res.json() : { token: "" }))
      .then((body) => {
        if (active) setToken(body.token || "")
      })
      .catch(() => {
        // A page that cannot get a token still renders; the components just send none.
        if (active) setToken("")
      })

    return () => {
      active = false
    }
  }, [reportId])

  return token
}
