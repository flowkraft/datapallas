"use client"

import { useEffect, useRef, useState } from "react"
import { rbConfig } from "@/lib/rb-config"
import { CodeBlock } from "@/components/CodeBlock"

interface RbParametersElement extends HTMLElement {
  configDsl?: string
  fetchConfig?: () => void
  getValues?: () => Record<string, unknown>
}

interface RbTabulatorElement extends HTMLElement {
  data?: unknown[]
  fetchData?: (params?: Record<string, unknown>) => void
}

type TabType = "component" | "config" | "usage"

export default function ReportParametersPage() {
  const paramsRef = useRef<RbParametersElement>(null)
  const dataTableRef = useRef<RbTabulatorElement>(null)
  const [configDsl, setConfigDsl] = useState("")
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({})
  const [isReady, setIsReady] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>("component")
  const [copiedConfig, setCopiedConfig] = useState(false)
  const [copiedUsage, setCopiedUsage] = useState(false)
  const [isFiltered, setIsFiltered] = useState(false)
  const [recordCount, setRecordCount] = useState("Loading...")
  const [originalDataCount, setOriginalDataCount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (customElements.get("rb-parameters")) {
      setIsReady(true)
      return
    }

    const handleComponentsLoaded = () => {
      setIsReady(true)
    }

    window.addEventListener("rb-components-loaded", handleComponentsLoaded)
    return () => {
      window.removeEventListener("rb-components-loaded", handleComponentsLoaded)
    }
  }, [])

  useEffect(() => {
    if (!isReady || !paramsRef.current) return

    const element = paramsRef.current

    const updateConfig = () => {
      if (element.configDsl) {
        setConfigDsl(element.configDsl)
      }
    }

    element.addEventListener("configLoaded", updateConfig)
    element.addEventListener("configFetched", updateConfig)

    element.addEventListener("valueChange", (e: Event) => {
      const detail = (e as CustomEvent).detail
      setParamValues(detail || {})
    })

    setTimeout(updateConfig, 100)
    setTimeout(updateConfig, 500)
    setTimeout(updateConfig, 1000)

    return () => {
      element.removeEventListener("configLoaded", updateConfig)
      element.removeEventListener("configFetched", updateConfig)
    }
  }, [isReady])

  useEffect(() => {
    if (!isReady || !dataTableRef.current) return

    const element = dataTableRef.current

    const handleDataLoaded = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const data = detail?.data || []
      const count = Array.isArray(data) ? data.length : 0
      setOriginalDataCount(count)
      setRecordCount(`${count} records`)
    }

    const handleReady = () => {
      setTimeout(() => {
        if (element.data && Array.isArray(element.data)) {
          const count = element.data.length
          setOriginalDataCount(count)
          setRecordCount(`${count} records`)
        }
      }, 200)
    }

    element.addEventListener("dataLoaded", handleDataLoaded)
    element.addEventListener("ready", handleReady)

    return () => {
      element.removeEventListener("dataLoaded", handleDataLoaded)
      element.removeEventListener("ready", handleReady)
    }
  }, [isReady])

  const copyToClipboard = async (text: string, type: "config" | "usage") => {
    try {
      await navigator.clipboard.writeText(text)

      if (type === "config") {
        setCopiedConfig(true)
        setTimeout(() => setCopiedConfig(false), 2000)
      } else {
        setCopiedUsage(true)
        setTimeout(() => setCopiedUsage(false), 2000)
      }
    } catch { /* ignore */ }
  }

  const handleRunReport = async () => {
    setIsSubmitting(true)
    try {
      const currentParamValues = paramsRef.current?.getValues ? paramsRef.current.getValues() : paramValues
      console.log("Running report with params:", currentParamValues)

      const queryParams = new URLSearchParams()
      const appliedFilters: Array<{ key: string; value: string }> = []

      for (const [key, value] of Object.entries(currentParamValues)) {
        if (value !== null && value !== undefined && value !== "") {
          queryParams.append(key, String(value))
          appliedFilters.push({ key, value: String(value) })
        }
      }

      const dataUrl = `${rbConfig.apiBaseUrl}/reports/par-employee-hire-dates/data?${queryParams.toString()}`
      console.log("Fetching filtered data from:", dataUrl)

      const response = await fetch(dataUrl, {
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) throw new Error(`Data fetch failed: ${response.status}`)

      const result = await response.json()
      const data = Array.isArray(result) ? result : result.data || []

      console.log("Filtered data received:", data.length, "records")

      if (dataTableRef.current) {
        dataTableRef.current.data = data
      }

      if (appliedFilters.length > 0) {
        setIsFiltered(true)
        setRecordCount(`${data.length} of ${originalDataCount} records`)
      }
    } catch (error) {
      console.error("Error running report:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClearFilters = () => {
    setIsFiltered(false)
    setRecordCount(`${originalDataCount} records`)

    if (dataTableRef.current?.fetchData) {
      dataTableRef.current.fetchData({})
    }
  }

  const usageCode = `<rb-parameters
  report-id="par-employee-hire-dates"
  api-base-url="${rbConfig.apiBaseUrl}"
  api-key="${rbConfig.apiKey}"
></rb-parameters>`

  const tabClass = (tab: TabType) =>
    `pb-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
      activeTab === tab
        ? "border-primary text-primary"
        : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
    }`

  return (
    <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-base-content mb-3">
            Report Parameters
          </h1>
          <p className="text-lg text-base-content/60">
            Define how users filter and customize reports at runtime.
          </p>
        </div>

        <div className="mb-6">
          <div className="border-b border-base-300">
            <div className="flex space-x-8">
              <button
                id="component-tab"
                onClick={() => setActiveTab("component")}
                className={tabClass("component")}
              >
                {/* sliders / adjustments icon */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"/></svg>
                Parameters
              </button>
              <button
                id="config-tab"
                onClick={() => setActiveTab("config")}
                className={tabClass("config")}
              >
                {/* cog / settings icon */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
                Configuration
              </button>
              <button
                id="usage-tab"
                onClick={() => setActiveTab("usage")}
                className={tabClass("usage")}
              >
                {/* code brackets icon */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/></svg>
                Usage
              </button>
            </div>
          </div>
        </div>

        <div className="bg-base-100 border border-base-300 rounded-lg shadow-sm">
          {activeTab === "component" && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="border border-base-300 rounded-lg">
                  <div className="border-b border-base-300 p-4 flex justify-between items-center">
                    <span className="font-semibold">Parameter Form</span>
                    <button
                      onClick={() => {
                        if (paramsRef.current?.fetchConfig) {
                          paramsRef.current.fetchConfig()
                        }
                      }}
                      className="btn btn-sm btn-outline"
                    >
                      {/* refresh / circular arrows icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
                    </button>
                  </div>
                  <div className="p-4">
                    {/* @ts-expect-error - Web component custom element */}
                    <rb-parameters
                      ref={paramsRef}
                      id="demoParams"
                      report-id="par-employee-hire-dates"
                      api-base-url={rbConfig.apiBaseUrl}
                      api-key={rbConfig.apiKey}
                    />
                    <hr className="my-4" />
                    <button id="submitBtn" onClick={handleRunReport} disabled={isSubmitting} className="btn btn-primary w-full">
                      {isSubmitting ? "Loading..." : "Run Report"}
                    </button>
                  </div>
                </div>

                <div className="border border-base-300 rounded-lg">
                  <div className="border-b border-base-300 p-4">
                    <span className="font-semibold">Current Values</span>
                  </div>
                  <div className="p-4">
                    <pre className="bg-base-200 p-4 rounded text-sm overflow-auto max-h-64">
                      {JSON.stringify(paramValues, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              <div
                className={`border rounded-lg ${
                  isFiltered
                    ? "border-warning ring-2 ring-warning/30"
                    : "border-base-300"
                }`}
              >
                <div
                  className={`border-b p-4 flex justify-between items-center ${
                    isFiltered
                      ? "bg-warning/10 border-warning"
                      : "border-base-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {isFiltered ? "Filtered Results" : "Sample Data"}
                    </span>
                    {isFiltered && (
                      <span className="bg-warning text-warning-content text-xs px-2 py-1 rounded">
                        Filtered
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span id="recordCount" className="text-sm text-base-content/60">{recordCount}</span>
                    {isFiltered && (
                      <button id="clearFiltersBtn" onClick={handleClearFilters} className="btn btn-sm btn-outline">
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-4 max-h-[450px] overflow-auto">
                  {/* @ts-expect-error - Web component custom element */}
                  <rb-tabulator
                    ref={dataTableRef}
                    id="dataTable"
                    report-id="par-employee-hire-dates"
                    api-base-url={rbConfig.apiBaseUrl}
                    api-key={rbConfig.apiKey}
                    style={{ display: "block", width: "100%" }}
                  />
                </div>
                <div
                  className={`border-t p-3 text-sm ${
                    isFiltered
                      ? "bg-warning/10 border-warning text-warning"
                      : "text-base-content/60"
                  }`}
                >
                  {isFiltered ? (
                    <span>⚠️ Filters applied. Use the parameters above and click &quot;Run Report&quot; to change filters.</span>
                  ) : (
                    <span>ℹ️ Showing all records. Use the parameters above and click &quot;Run Report&quot; to filter.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "config" && (
            <div className="relative">
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={() => copyToClipboard(configDsl || "", "config")}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-base-300 rounded hover:bg-base-200 bg-base-100/80 backdrop-blur"
                >
                  {copiedConfig ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-success"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                  )}
                  {copiedConfig ? "Copied!" : "Copy"}
                </button>
              </div>
              <div id="configCode">
                <CodeBlock code={configDsl || "// Configuration will load after component initializes..."} language="groovy" />
              </div>
            </div>
          )}

          {activeTab === "usage" && (
            <div className="relative">
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={() => copyToClipboard(usageCode, "usage")}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-base-300 rounded hover:bg-base-200 bg-base-100/80 backdrop-blur"
                >
                  {copiedUsage ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-success"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                  )}
                  {copiedUsage ? "Copied!" : "Copy"}
                </button>
              </div>
              <div id="usageCode">
                <CodeBlock code={usageCode} language="markup" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
