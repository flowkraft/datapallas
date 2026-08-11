import { NextRequest, NextResponse } from "next/server"

import { mintEmbedToken } from "@/lib/rb-config"

/**
 * Mints an embed token for one report, on this application's server.
 *
 * The pages here are client components, so they cannot mint directly — minting needs the API key,
 * which authenticates as an administrator and must never reach a browser. They call this route
 * instead and receive a token that is short-lived and scoped to a single report.
 *
 * Handing that token to the browser is the design, not a leak: it is exactly what goes into the
 * `embed-token` attribute, and it unlocks only the data the page is already displaying.
 */
export async function GET(request: NextRequest) {
  const reportId = request.nextUrl.searchParams.get("reportId")

  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 })
  }

  return NextResponse.json({ token: await mintEmbedToken(reportId) })
}
