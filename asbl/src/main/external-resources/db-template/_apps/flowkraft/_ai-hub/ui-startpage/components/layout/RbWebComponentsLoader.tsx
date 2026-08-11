"use client"

import { useEffect, useState } from "react"
import Script from "next/script"

// URL for the DataPallas web components script
const RB_WEBCOMPONENTS_URL = process.env.NEXT_PUBLIC_RB_API_BASE_URL
  ? `${process.env.NEXT_PUBLIC_RB_API_BASE_URL}/rb-webcomponents/rb-webcomponents.umd.js`
  : "http://localhost:9090/rb-webcomponents/rb-webcomponents.umd.js"

/**
 * RbWebComponentsLoader
 *
 * Loads the DataPallas web components script globally.
 * Also sets up the window.rbConfig object needed by the components.
 *
 * This should be included in the root layout to ensure the script
 * is loaded once and available to all pages.
 */
export function RbWebComponentsLoader() {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // Data fetched BY the web components goes through this app's server-side proxy, like every
    // other backend call here — see app/api/dp/[...path]/route.ts.
    //
    // Note this also corrects a real bug: the components build URLs as `${apiBaseUrl}/cubes/...`,
    // so the base has to include the `/api` segment. The previous value was
    // "http://localhost:9090" without it, which produced /cubes/... and a 404.
    //
    // No apiKey: the browser has no business holding one. The proxy attaches the real credential
    // server-side, where a page script cannot read it.
    // @ts-expect-error - Global window extension
    window.rbConfig = {
      apiBaseUrl: "/api/dp",
      apiKey: "",
    }
  }, [])

  return (
    <Script
      src={RB_WEBCOMPONENTS_URL}
      strategy="afterInteractive"
      onLoad={() => {
        console.log("DataPallas web components loaded successfully")
        setIsLoaded(true)
        // Dispatch a custom event that pages can listen for
        window.dispatchEvent(new CustomEvent("rb-components-loaded"))
      }}
      onError={(e) => {
        console.error("Failed to load DataPallas web components:", e)
      }}
    />
  )
}
