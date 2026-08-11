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
    // apiBaseUrl only — it is just a URL.
    //
    // No apiKey: that value authenticates as an administrator, and a NEXT_PUBLIC_ variable is
    // inlined into the browser bundle, so publishing it here would hand it to every visitor.
    // Components receive a short-lived, single-report embed-token attribute instead.
    // @ts-expect-error - Global window extension
    window.rbConfig = {
      apiBaseUrl: process.env.NEXT_PUBLIC_RB_API_BASE_URL || "http://localhost:9090",
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
