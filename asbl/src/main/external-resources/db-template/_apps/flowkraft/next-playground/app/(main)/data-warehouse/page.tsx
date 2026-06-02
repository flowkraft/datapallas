"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { rbConfig } from "@/lib/rb-config"
import { CodeBlock } from "@/components/CodeBlock"

interface RbPivotTableElement extends HTMLElement {
  configDsl?: string
  fetchData?: (params?: Record<string, unknown>) => void
}

type TabType = "warehouse" | "rawdata" | "config" | "usage"

export default function DataWarehousePage() {
  const warehouseBrowserRef = useRef<RbPivotTableElement>(null)
  const warehouseDuckdbRef = useRef<RbPivotTableElement>(null)
  const warehouseClickhouseRef = useRef<RbPivotTableElement>(null)

  const [isReady, setIsReady] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>("warehouse")
  const [clickhouseWarningVisible, setClickhouseWarningVisible] = useState(true)
  const { toast } = useToast()

  // Config DSL per engine
  const [configBrowser, setConfigBrowser] = useState("")
  const [configDuckdb, setConfigDuckdb] = useState("")
  const [configClickhouse, setConfigClickhouse] = useState("")

  // Copy state per button
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})

  // Raw data pagination state
  const [rawData, setRawData] = useState<Record<string, unknown>[]>([])
  const [rawColumns, setRawColumns] = useState<string[]>([])
  const [rawCurrentPage, setRawCurrentPage] = useState(0)
  const [rawPageSize, setRawPageSize] = useState(10)
  const [rawTotalRows, setRawTotalRows] = useState(0)
  const [rawLoading, setRawLoading] = useState(false)
  const [rawError, setRawError] = useState("")
  const [rawLoaded, setRawLoaded] = useState(false)

  // Web component readiness
  useEffect(() => {
    if (customElements.get("rb-pivot-table")) {
      setIsReady(true)
      return
    }
    const handleComponentsLoaded = () => setIsReady(true)
    window.addEventListener("rb-components-loaded", handleComponentsLoaded)
    return () => window.removeEventListener("rb-components-loaded", handleComponentsLoaded)
  }, [])

  // Listen for config events on each pivot component
  useEffect(() => {
    if (!isReady) return

    const engines = [
      { ref: warehouseBrowserRef, setter: setConfigBrowser },
      { ref: warehouseDuckdbRef, setter: setConfigDuckdb },
      { ref: warehouseClickhouseRef, setter: setConfigClickhouse },
    ]

    const cleanups: (() => void)[] = []

    for (const { ref, setter } of engines) {
      const el = ref.current
      if (!el) continue

      const updateConfig = () => {
        if (el.configDsl) setter(el.configDsl)
      }

      el.addEventListener("configLoaded", updateConfig)
      el.addEventListener("dataFetched", updateConfig)
      setTimeout(updateConfig, 100)
      setTimeout(updateConfig, 500)

      cleanups.push(() => {
        el.removeEventListener("configLoaded", updateConfig)
        el.removeEventListener("dataFetched", updateConfig)
      })
    }

    return () => cleanups.forEach((fn) => fn())
  }, [isReady])

  // ClickHouse warning: hide on pivotExecuted, show on error
  useEffect(() => {
    if (!isReady) return
    const el = warehouseClickhouseRef.current
    if (!el) return

    const onSuccess = () => setClickhouseWarningVisible(false)
    const onError = () => {
      setClickhouseWarningVisible(true)
      toast({ title: "ClickHouse connection failed", description: "Start the ClickHouse starter pack from the Connections page.", variant: "destructive", duration: 5000 })
    }

    el.addEventListener("pivotExecuted", onSuccess)
    el.addEventListener("error", onError)
    return () => {
      el.removeEventListener("pivotExecuted", onSuccess)
      el.removeEventListener("error", onError)
    }
  }, [isReady, toast])

  // Raw data fetch
  const fetchRawPage = useCallback(async (page: number, size: number) => {
    setRawLoading(true)
    setRawError("")
    try {
      const res = await fetch(`${rbConfig.apiBaseUrl}/reports/piv-northwind-warehouse-browser/data?page=${page + 1}&size=${size}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json()
      const data: Record<string, unknown>[] = Array.isArray(result) ? result : (result?.data || [])
      const total = result?.totalRows ?? data.length

      if (data.length > 0 && rawColumns.length === 0) {
        const cols = result?.reportColumnNames || Object.keys(data[0])
        setRawColumns(cols)
      }

      setRawData(data)
      setRawTotalRows(total)
    } catch (err) {
      setRawError(err instanceof Error ? err.message : "Failed to fetch data")
    } finally {
      setRawLoading(false)
    }
  }, [rawColumns.length])

  // Load raw data on tab activation
  useEffect(() => {
    if (activeTab === "rawdata" && !rawLoaded) {
      setRawLoaded(true)
      fetchRawPage(0, rawPageSize)
    }
  }, [activeTab, rawLoaded, rawPageSize, fetchRawPage])

  // Copy to clipboard helper
  const copyWithFeedback = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedStates((prev) => ({ ...prev, [key]: true }))
      setTimeout(() => setCopiedStates((prev) => ({ ...prev, [key]: false })), 2000)
      toast({ title: "Copied to clipboard!", duration: 2000 })
    } catch {
      toast({ title: "Copy failed", variant: "destructive", duration: 2000 })
    }
  }, [toast])

  // Pagination helpers
  const totalPages = Math.ceil(rawTotalRows / rawPageSize)
  const showingFrom = rawCurrentPage * rawPageSize + 1
  const showingTo = Math.min((rawCurrentPage + 1) * rawPageSize, rawTotalRows)

  const handlePageChange = (newPage: number) => {
    setRawCurrentPage(newPage)
    fetchRawPage(newPage, rawPageSize)
  }

  const handlePageSizeChange = (newSize: number) => {
    setRawPageSize(newSize)
    setRawCurrentPage(0)
    fetchRawPage(0, newSize)
  }

  const renderPagination = () => {
    if (totalPages <= 1) return null
    const pages: (number | "...")[] = []
    for (let i = 0; i < totalPages; i++) {
      if (i === 0 || i === totalPages - 1 || Math.abs(i - rawCurrentPage) <= 2) {
        pages.push(i)
      } else if (pages[pages.length - 1] !== "...") {
        pages.push("...")
      }
    }

    return (
      <nav id="rawDataPagination" aria-label="Raw data pagination" className="flex justify-center mt-3">
        <div className="inline-flex items-center gap-1">
          <button
            onClick={() => handlePageChange(rawCurrentPage - 1)}
            disabled={rawCurrentPage === 0}
            className="px-2 py-1 text-sm border border-base-300 rounded hover:bg-base-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            &laquo;
          </button>
          {pages.map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-2 py-1 text-sm text-base-content/60">...</span>
            ) : (
              <button
                key={p}
                data-page={p}
                onClick={() => handlePageChange(p)}
                className={`px-2.5 py-1 text-sm border rounded ${
                  p === rawCurrentPage
                    ? "bg-rb-cyan text-primary-content border-rb-cyan"
                    : "border-base-300 hover:bg-base-200"
                }`}
              >
                {p + 1}
              </button>
            )
          )}
          <button
            onClick={() => handlePageChange(rawCurrentPage + 1)}
            disabled={rawCurrentPage >= totalPages - 1}
            className="px-2 py-1 text-sm border border-base-300 rounded hover:bg-base-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            &raquo;
          </button>
        </div>
      </nav>
    )
  }

  // Usage code snippets
  const usageBrowser = `<rb-pivot-table
  report-id="piv-northwind-warehouse-browser"
  api-base-url="\${RbUtils.apiBaseUrl}"
  api-key="\${RbUtils.apiKey}"
></rb-pivot-table>`

  const usageDuckdb = `<rb-pivot-table
  report-id="piv-northwind-warehouse-duckdb"
  api-base-url="\${RbUtils.apiBaseUrl}"
  api-key="\${RbUtils.apiKey}"
></rb-pivot-table>`

  const usageClickhouse = `<rb-pivot-table
  report-id="piv-northwind-warehouse-clickhouse"
  api-base-url="\${RbUtils.apiBaseUrl}"
  api-key="\${RbUtils.apiKey}"
></rb-pivot-table>`

  const tabs: { id: string; label: string; icon: React.ReactNode; value: TabType }[] = [
    { id: "warehouse-tab", label: "Data Warehouse", icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg>, value: "warehouse" },
    { id: "rawdata-tab", label: "Raw Data", icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h.008v.008h-.008V9m.375 0a1.125 1.125 0 0 1-1.125 1.125H3.375A1.125 1.125 0 0 1 2.25 9m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125H3.375A1.125 1.125 0 0 1 2.25 10.5m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125m0 0h-17.25"/></svg>, value: "rawdata" },
    { id: "config-tab", label: "Configuration", icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>, value: "config" },
    { id: "usage-tab", label: "Usage", icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/></svg>, value: "usage" },
  ]

  const isCopied = (key: string) => copiedStates[key] || false

  return (
    <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-6">
          <h4 className="text-2xl font-bold text-base-content mb-2 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/>
            </svg>
            Northwind Data Warehouse (Sample Data)
          </h4>
          <p className="text-base-content/60">
            OLAP analysis on ~8,000 sample sales transactions with Browser, DuckDB, and ClickHouse engines.
            All three engines share the same data and the same pivot configuration &mdash; so you can compare them side by side and switch engines without changing anything else.
          </p>
        </div>

        {/* Data Warehouse Facts */}
        <div className="mb-6">
          <p className="mb-2 text-sm">
            Data warehouses store large volumes of business data for historical analysis and reporting.
            Processing these volumes requires specialized techniques &mdash; but more tools mean more infrastructure, more complexity, and higher costs.
          </p>
          <p className="mb-4 text-sm">
            <strong>DataPallas&apos;s approach:</strong> start with the simplest option. Only move to the next tier when your data volume actually demands it.
          </p>

          {/* Tier Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {/* Browser Tier */}
            <div className="border border-success/30 rounded-lg p-4 hover:shadow-md transition-shadow">
              <h6 className="font-semibold mb-1 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/></svg> Browser Pivot
              </h6>
              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success mb-2">
                Up to ~100K rows
              </span>
              <p className="text-sm text-base-content/60 mb-2">
                Zero setup. Client-side JavaScript does all the work. Most business reports never need more than this.
              </p>
              <a href="#engine-browser" className="text-sm text-rb-cyan hover:underline flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"/></svg> Jump to Browser
              </a>
            </div>

            {/* DuckDB Tier */}
            <div className="border border-info/30 rounded-lg p-4 hover:shadow-md transition-shadow">
              <h6 className="font-semibold mb-1 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg> DuckDB
              </h6>
              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-info/10 text-info mb-2">
                ~100K &ndash; 100M rows
              </span>
              <p className="text-sm text-base-content/60 mb-2">
                Almost no overhead &mdash; a single file on disk. Server-side aggregation handles medium to large volumes. You just need to be aware it exists and use / enable it.
              </p>
              <a href="#engine-duckdb" className="text-sm text-rb-cyan hover:underline flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"/></svg> Jump to DuckDB
              </a>
            </div>

            {/* ClickHouse Tier */}
            <div className="border border-warning/30 rounded-lg p-4 hover:shadow-md transition-shadow">
              <h6 className="font-semibold mb-1 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z"/></svg> ClickHouse
              </h6>
              <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-warning/10 text-warning mb-2">
                100M &ndash; 10B+ rows
              </span>
              <p className="text-sm text-base-content/60 mb-2">
                For truly massive volumes. A dedicated OLAP server with sub-second queries on billions of rows.
                Additional infrastructure and maintenance cost, but unmatched performance at scale.
              </p>
              <a href="#engine-clickhouse" className="text-sm text-rb-cyan hover:underline flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"/></svg> Jump to ClickHouse
              </a>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div id="warehouseTabs" className="border-b border-base-300 mb-0">
          <div className="flex space-x-6 overflow-x-auto" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={tab.id}
                role="tab"
                aria-controls={`${tab.value}-pane`}
                aria-selected={activeTab === tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap flex items-center gap-2 ${
                  activeTab === tab.value
                    ? "border-rb-cyan text-rb-cyan"
                    : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-300"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div id="warehouseTabContent" className="bg-base-100 border border-t-0 border-base-300 rounded-b-lg p-4">

          {/* Data Warehouse Pane */}
          <div id="warehouse-pane" role="tabpanel" aria-labelledby="warehouse-tab" className={activeTab !== "warehouse" ? "hidden" : ""}>
            {/* Alert */}
            <div className="bg-info/10 border border-info/30 rounded-md p-3 mb-4 text-sm">
              <span className="text-info">
                ~8,000 sales transactions from the Northwind Star Schema (view: <code className="bg-base-200 px-1 rounded">vw_sales_detail</code>).
                Countries &times; Categories &times; Quarters with <code className="bg-base-200 px-1 rounded">net_revenue</code> as the default measure.
              </span>
            </div>

            {/* Browser Engine */}
            <div className="engine-section mb-6 scroll-mt-20" id="engine-browser">
              <h6 className="font-semibold mb-1 flex items-center gap-1.5 text-base">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/></svg> Browser Engine
              </h6>
              <p className="text-sm text-base-content/60 mb-3">
                Client-side pivot &mdash; all processing in the browser. Great for quick exploration and datasets up to ~100K rows.
                Zero infrastructure needed, works offline once data is loaded.
              </p>
              {/* @ts-expect-error - Web component custom element */}
              <rb-pivot-table
                ref={warehouseBrowserRef}
                id="warehousePivotBrowser"
                report-id="piv-northwind-warehouse-browser"
                api-base-url={rbConfig.apiBaseUrl}
                api-key={rbConfig.apiKey}
              />
            </div>

            {/* DuckDB Engine */}
            <div className="engine-section mb-6 scroll-mt-20" id="engine-duckdb">
              <h6 className="font-semibold mb-1 flex items-center gap-1.5 text-base">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg> DuckDB Engine
              </h6>
              <p className="text-sm text-base-content/60 mb-3">
                Server-side embedded OLAP (single file, no server to manage).
                Handles <strong>medium to large volumes</strong> with fast columnar queries.
                Think of it as SQLite for analytics &mdash; <strong>100K&ndash;100M rows</strong> is comfortable territory.
              </p>
              {/* @ts-expect-error - Web component custom element */}
              <rb-pivot-table
                ref={warehouseDuckdbRef}
                id="warehousePivotDuckdb"
                report-id="piv-northwind-warehouse-duckdb"
                api-base-url={rbConfig.apiBaseUrl}
                api-key={rbConfig.apiKey}
              />
            </div>

            {/* ClickHouse Engine */}
            <div className="engine-section mb-6 scroll-mt-20" id="engine-clickhouse">
              <h6 className="font-semibold mb-1 flex items-center gap-1.5 text-base">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z"/></svg> ClickHouse Engine
              </h6>
              <p className="text-sm text-base-content/60 mb-3">
                Server-side columnar OLAP database (requires ClickHouse starter pack).
                Built for scale: handles <strong>millions to billions of rows</strong> with sub-second queries.
                The go-to for production analytics &mdash; <strong>100M&ndash;10B+ rows</strong> is everyday territory.
              </p>
              {clickhouseWarningVisible && (
                <div id="clickhouseWarning" className="bg-warning/10 border border-warning/30 rounded-md p-3 mb-3 text-sm flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-warning shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
                  <span className="text-warning">
                    Start the ClickHouse starter pack from the Connections page to see warehouse data.
                  </span>
                </div>
              )}
              {/* @ts-expect-error - Web component custom element */}
              <rb-pivot-table
                ref={warehouseClickhouseRef}
                id="warehousePivotClickhouse"
                report-id="piv-northwind-warehouse-clickhouse"
                api-base-url={rbConfig.apiBaseUrl}
                api-key={rbConfig.apiKey}
              />
            </div>

            {/* How to Use Section */}
            <div className="mt-8 bg-base-200 rounded-lg p-6">
              <h5 className="text-xl font-semibold text-primary mb-4 flex items-center gap-2">
                <span>💡</span> How to Use This Warehouse Pivot
              </h5>

              <p className="mb-1"><strong>What you&apos;re looking at right now:</strong></p>
              <p className="mb-2 text-sm">
                The default view shows <strong>Country → Category</strong> as rows, <strong>Year-Quarter</strong> as columns,
                and <strong>Sum of net_revenue</strong> in each cell. This is a real data warehouse layout &mdash; the same kind of
                analysis people build in Excel every Monday morning, except here it&apos;s instant and interactive.
              </p>
              <p className="mb-4 text-sm">
                ~8,000 transactions. 10 countries. 8 product categories. 8 quarters. 30 customers. 16 products. 3 sales reps. Try everything below &mdash; every step works on the live data in front of you.
              </p>

              <h6 className="text-lg font-semibold text-primary mt-5 mb-3">Step-by-Step: Do These Now</h6>

              {[
                { title: "1. Find the Biggest Market", lines: [<>Look at the <strong>row totals</strong> (rightmost column). Which country drives the most revenue?</>, <><strong>Try:</strong> Scan the <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">Totals</code> column. USA and Germany should be at the top &mdash; they&apos;re the largest markets.</>], insight: "→ You just answered \"Where should we focus sales effort?\" without writing a single query." },
                { title: "2. Drill Into a Country", lines: [<>Each country row has category sub-rows (Country → Category hierarchy).</>, <><strong>Try:</strong> Find <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">Germany</code> and look at its category breakdown. <strong>Dairy Products</strong> and <strong>Confections</strong> should be notably higher than Meat &mdash; Europeans buy more dairy.</>, <>Now find <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">USA</code>. <strong>Meat/Poultry</strong> and <strong>Condiments</strong> should be stronger &mdash; different regional preferences.</>], insight: "→ Same product catalog, completely different buying patterns by geography. This is exactly what OLAP reveals." },
                { title: "3. Compare Continents Instead of Countries", lines: [<><strong>Try:</strong> Drag <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">continent</code> from the unused fields area → Drop it into the <strong>rows area</strong>, above <code>customer_country</code>. Then drag <code>customer_country</code> out (back to unused).</>, <>Now you see: <strong>Europe vs North America vs South America</strong> &mdash; clean continent-level totals per quarter.</>], insight: "→ \"Is Europe or the Americas our bigger market?\" — answered. One drag, zero SQL." },
                { title: "4. Spot the Seasonal Pattern", lines: [<>Look across the quarter columns (2023-Q1 through 2024-Q4).</>, <><strong>Try:</strong> Compare any country&apos;s <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">Q4</code> vs <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">Q1</code> values. Q4 (holiday season) should be noticeably higher than Q1 (post-holiday slowdown).</>], insight: "→ \"Is our business seasonal?\" — the pattern is right there: Q1 < Q2 < Q3 < Q4, every year. Plan inventory accordingly." },
                { title: "5. Check Year-over-Year Growth", lines: [<><strong>Try:</strong> Compare <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">2023-Q1</code> column totals vs <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">2024-Q1</code>. The 2024 numbers should be ~5% higher across the board.</>], insight: "→ \"Are we growing?\" — yes, consistently. This is how CFOs track performance without a BI team." },
                { title: "6. Gross vs Net — What Are Discounts Costing Us?", lines: [<><strong>Try:</strong> Click the <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">net_revenue ▼</code> dropdown in the values area → Select <strong>gross_revenue</strong> instead.</>, <>The numbers go up. The difference = discount impact. Switch back to <code>net_revenue</code>.</>, <>Now try: Select <strong>both</strong> <code>net_revenue</code> and <code>gross_revenue</code> at the same time (if supported) or toggle between them.</>], insight: "→ \"How much margin are we giving away in discounts?\" — the gap between gross and net tells you instantly." },
                { title: "7. Who's Selling What? (Sales Rep Analysis)", lines: [<><strong>Try:</strong> Drag <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">employee_name</code> into rows. You&apos;ll see Nancy Davolio, Andrew Fuller, and Janet Leverling.</>, <>Now drag <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">category_name</code> below <code>employee_name</code> in rows.</>], insight: "→ \"Which rep sells the most Seafood?\" \"Who's our Dairy specialist?\" — it's a performance review in one glance." },
                { title: "8. Average Transaction Value (Not Just Totals)", lines: [<><strong>Try:</strong> Click the <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">Sum ▼</code> dropdown (top-left) → Select <strong>Average</strong>.</>, <>Now cells show average revenue per transaction, not totals. High-volume countries might have <em>lower</em> averages.</>], insight: "→ \"Are we making money through volume or premium pricing?\" — Average separates the two." },
                { title: "9. Filter to Focus", lines: [<><strong>Try:</strong> Click the <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">▼</code> triangle next to <code>customer_country</code> → Uncheck everything except <strong>USA</strong>, <strong>Germany</strong>, and <strong>France</strong>.</>], insight: "→ Noise gone. Three key markets compared side by side. This is how you prepare a board presentation in 10 seconds." },
                { title: "10. Visualize It", lines: [<><strong>Try:</strong> Click the <code className="bg-base-200 px-1.5 py-0.5 rounded text-sm">Table ▼</code> renderer dropdown → Select <strong>Grouped Column Chart</strong>.</>, <>Countries become colored bars, quarters become groups. Trends jump out visually.</>, <>Try <strong>Stacked Bar Chart</strong> (see category proportions) or <strong>Line Chart</strong> (see trends over time).</>], insight: "→ Same data, different presentation. Charts make the pattern obvious for non-technical stakeholders." },
              ].map((step) => (
                <div key={step.title} className="bg-base-100 border border-base-300 rounded-md p-4 mb-3">
                  <div className="font-semibold text-base-content mb-2">{step.title}</div>
                  {step.lines.map((line, i) => (
                    <p key={i} className="text-sm mb-1">{line}</p>
                  ))}
                  <p className="text-sm text-success italic mb-0">{step.insight}</p>
                </div>
              ))}

              <h6 className="text-lg font-semibold text-primary mt-5 mb-3">Real Questions This Data Answers</h6>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li><strong>&quot;Which country-category combo is our gold mine?&quot;</strong> &mdash; Default view. Scan for the biggest cells. Germany &times; Dairy? USA &times; Meat?</li>
                <li><strong>&quot;Should we invest more in Europe or the Americas?&quot;</strong> &mdash; Drag <code>continent</code> to rows. Compare totals. Decision made.</li>
                <li><strong>&quot;Are discounts eating our margins?&quot;</strong> &mdash; Toggle between <code>gross_revenue</code> and <code>net_revenue</code>. The gap = discount cost.</li>
                <li><strong>&quot;What&apos;s our Q4 holiday uplift?&quot;</strong> &mdash; Compare Q4 vs Q2 columns. The difference is your seasonal revenue.</li>
                <li><strong>&quot;Do Europeans buy different products than Americans?&quot;</strong> &mdash; Rows: <code>continent</code> → <code>category_name</code>. Europe leans Dairy + Confections. Americas lean Meat + Condiments.</li>
                <li><strong>&quot;Which product should we discontinue?&quot;</strong> &mdash; Drag <code>product_name</code> to rows, remove countries. Sort by totals. Lowest performer = candidate.</li>
                <li><strong>&quot;Who gets the sales bonus this quarter?&quot;</strong> &mdash; Drag <code>employee_name</code> to rows. Highest total wins.</li>
                <li><strong>&quot;Is Sweden worth keeping as a market?&quot;</strong> &mdash; Filter to just Sweden. Small revenue? Compare cost of operations vs revenue. The data tells the story.</li>
              </ul>

              <h6 className="text-lg font-semibold text-primary mt-5 mb-3">Why This Matters &mdash; The &quot;Excel Problem&quot;</h6>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div>
                  <p className="mb-1 font-medium">What teams do today:</p>
                  <div className="bg-gray-900 text-sky-300 font-mono text-xs p-3 rounded">
                    <pre className="whitespace-pre">{`1. Export data to CSV
2. Open in Excel
3. Build pivot table manually
4. Email the spreadsheet
5. Someone asks "now show me by quarter"
6. Rebuild the pivot table
7. Repeat 47 times...`}</pre>
                  </div>
                </div>
                <div>
                  <p className="mb-1 font-medium">What this does instead:</p>
                  <div className="bg-success/10 border border-success/30 p-3 rounded text-sm">
                    <p><strong>✓</strong> Data stays in the warehouse (no CSV exports)</p>
                    <p><strong>✓</strong> Anyone opens the link, drags dimensions, gets answers</p>
                    <p><strong>✓</strong> &quot;Show me by quarter&quot; = one drag, 2 seconds</p>
                    <p><strong>✓</strong> Always live data, never a stale spreadsheet</p>
                    <p><strong>✓</strong> Works on 8,000 rows or 8 million (switch engines)</p>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm mb-0">
                <strong>Bottom line:</strong> If your team currently exports to Excel to build pivot tables, they already know
                how to use this &mdash; it&apos;s the same concept, except it&apos;s live, connected to the database, and sharable via URL.
                No more &quot;which version of the spreadsheet is correct?&quot; conversations.
              </p>
            </div>
          </div>

          {/* Raw Data Pane */}
          <div id="rawdata-pane" role="tabpanel" aria-labelledby="rawdata-tab" className={activeTab !== "rawdata" ? "hidden" : ""}>
            <p className="text-sm text-base-content/60 mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>
              Raw data from the Browser engine report (<code>piv-northwind-warehouse-browser</code>). Server-side pagination &mdash; only the visible page is loaded.
            </p>

            {/* Controls */}
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <label className="text-sm text-base-content/60">Page size:</label>
                <select
                  id="rawDataPageSize"
                  value={rawPageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="text-sm border border-base-300 rounded px-2 py-1 bg-base-100"
                >
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <span id="rawDataInfo" className="text-sm text-base-content/60">
                {rawTotalRows > 0 ? `Showing ${showingFrom}-${showingTo} of ${rawTotalRows} rows` : ""}
              </span>
            </div>

            {/* Loading */}
            <div id="rawDataLoading" className={rawLoading ? "text-center py-4" : "hidden"}>
              <span className="loading loading-spinner loading-sm text-base-content/40 mx-auto block"></span>
              <span className="text-sm text-base-content/60">Loading data...</span>
            </div>

            {/* Error */}
            {rawError && (
              <div id="rawDataError" className="bg-error/10 border border-error/30 rounded p-3 text-error text-sm">
                {rawError}
              </div>
            )}

            {/* Table */}
            {!rawLoading && !rawError && rawData.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table id="rawDataTable" className="w-full text-sm border-collapse">
                    <thead id="rawDataHead">
                      <tr className="border-b border-base-300 bg-base-200/50">
                        {rawColumns.map((col) => (
                          <th key={col} className="px-3 py-2 text-left font-medium text-base-content/60 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody id="rawDataBody">
                      {rawData.map((row, i) => (
                        <tr key={i} className="border-b border-base-300 hover:bg-base-200/30">
                          {rawColumns.map((col) => (
                            <td key={col} className="px-3 py-1.5 whitespace-nowrap">
                              {String(row[col] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {renderPagination()}
              </>
            )}
          </div>

          {/* Configuration Pane */}
          <div id="config-pane" role="tabpanel" aria-labelledby="config-tab" className={activeTab !== "config" ? "hidden" : ""}>
            <p className="text-sm text-base-content/60 mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>
              All three reports use the same pivot table configuration &mdash; only the OLAP backend engine differs.
              This lets you choose the engine that matches your data volume without changing your report definition.
            </p>

            {[
              { label: "Browser Engine", icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/></svg>, id: "configCodeBrowser", config: configBrowser, copyKey: "config-browser" },
              { label: "DuckDB Engine", icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg>, id: "configCodeDuckdb", config: configDuckdb, copyKey: "config-duckdb" },
              { label: "ClickHouse Engine", icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z"/></svg>, id: "configCodeClickhouse", config: configClickhouse, copyKey: "config-clickhouse" },
            ].map((eng) => (
              <div key={eng.id} className="engine-section mb-3">
                <div className="flex justify-between items-center">
                  <h6 className="font-semibold flex items-center gap-1.5 mb-0">{eng.icon} {eng.label}</h6>
                  <Button
                    variant="outline"
                    size="sm"
                    className="copy-config-btn"
                    data-target={eng.id}
                    title="Copy to clipboard"
                    onClick={() => copyWithFeedback(eng.copyKey, eng.config || "")}
                  >
                    {isCopied(eng.copyKey) ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-success"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                    )}
                  </Button>
                </div>
                <div id={eng.id} className="mt-2">
                  <CodeBlock code={eng.config || "Loading configuration..."} language="groovy" style={{ maxHeight: "400px" }} />
                </div>
              </div>
            ))}
          </div>

          {/* Usage Pane */}
          <div id="usage-pane" role="tabpanel" aria-labelledby="usage-tab" className={activeTab !== "usage" ? "hidden" : ""}>
            {[
              { label: "Browser Engine", icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/></svg>, id: "usageCodeBrowser", code: usageBrowser, copyKey: "usage-browser" },
              { label: "DuckDB Engine", icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"/></svg>, id: "usageCodeDuckdb", code: usageDuckdb, copyKey: "usage-duckdb" },
              { label: "ClickHouse Engine", icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z"/></svg>, id: "usageCodeClickhouse", code: usageClickhouse, copyKey: "usage-clickhouse" },
            ].map((eng) => (
              <div key={eng.id} className="engine-section mb-3">
                <div className="flex justify-between items-center">
                  <h6 className="font-semibold flex items-center gap-1.5 mb-0">{eng.icon} {eng.label}</h6>
                  <Button
                    variant="outline"
                    size="sm"
                    className="copy-usage-btn"
                    data-target={eng.id}
                    title="Copy to clipboard"
                    onClick={() => copyWithFeedback(eng.copyKey, eng.code)}
                  >
                    {isCopied(eng.copyKey) ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-success"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
                    )}
                  </Button>
                </div>
                <div id={eng.id} className="mt-2">
                  <CodeBlock code={eng.code} language="markup" style={{ maxHeight: "400px" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
