"use client"

import { useState, useEffect } from "react"
import { rbConfig } from "@/lib/rb-config"
import { useEmbedToken } from "@/lib/use-embed-token"

export default function DashboardsPage() {
  const embedToken = useEmbedToken("dashboard-cfo")
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (customElements.get("rb-chart") && customElements.get("rb-tabulator")) {
      setIsReady(true)
      return
    }
    const handleLoaded = () => setIsReady(true)
    window.addEventListener("rb-components-loaded", handleLoaded)
    return () => window.removeEventListener("rb-components-loaded", handleLoaded)
  }, [])

  return (
    <div className="w-full py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* Toolbar: title + dashboard selector */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h4 className="text-2xl font-bold text-base-content mb-1">Dashboards</h4>
            <p className="text-sm text-base-content/60">
              Pre-built executive dashboards powered by <code className="bg-base-200 text-base-content px-1 rounded">&lt;rb-chart&gt;</code> and <code className="bg-base-200 text-base-content px-1 rounded">&lt;rb-tabulator&gt;</code> components.
            </p>
          </div>
          <select id="dashboard-select" className="w-auto border border-base-300 rounded-lg px-3 py-2 text-sm bg-base-100 text-base-content">
            <option value="cfo">CFO Analytics Dashboard</option>
          </select>
        </div>

        {!isReady ? (
          <div className="text-center py-12 text-base-content/60">Loading web components...</div>
        ) : (
          <>
            {/* KPI Row 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <KpiCard
                id="kpi-revenue"
                label="Total Revenue"
                value="$847,320"
                detail={<><span className="text-success"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-3 h-3 inline"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18"/></svg> 12.5%</span> vs last period</>}
                borderColor="border-l-success"
              />
              <KpiCard
                id="kpi-profit"
                label="Gross Profit"
                value="$292,180"
                detail={<><span className="text-info font-semibold">34.5%</span> profit margin</>}
                borderColor="border-l-info"
              />
              <KpiCard
                id="kpi-orders"
                label="Total Orders"
                value="1,247"
                detail={<><span className="text-success"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-3 h-3 inline"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18"/></svg> 8.3%</span> avg. $680/order</>}
                borderColor="border-l-purple-500"
              />
              <KpiCard
                id="kpi-ar"
                label="Outstanding AR"
                value="$128,450"
                detail={<><span className="text-warning"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3 inline"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg> 23 invoices</span> overdue</>}
                borderColor="border-l-error"
              />
            </div>

            {/* KPI Row 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KpiCard
                id="kpi-top-customer"
                label="Top Customer"
                value="Save-a-lot Markets"
                valueSize="text-lg"
                detail={<><strong>$89,340</strong> YTD revenue</>}
                borderColor="border-l-cyan-500"
              />
              <KpiCard
                id="kpi-top-product"
                label="Top Product"
                value="C&ocirc;te de Blaye"
                valueSize="text-lg"
                detail={<><strong>89 units</strong> this period</>}
                borderColor="border-l-orange-500"
                valueHtml
              />
              <KpiCard
                id="kpi-dso"
                label="Days Sales Outstanding"
                value="28"
                detail={<><span className="text-success"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-3 h-3 inline"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3"/></svg> 3 days</span> vs target: 30</>}
                borderColor="border-l-warning"
              />
              <KpiCard
                id="kpi-top-region"
                label="Top Region"
                value="Germany"
                valueSize="text-lg"
                detail={<><strong>$198,520</strong> (23.4% of total)</>}
                borderColor="border-l-pink-500"
              />
            </div>

            {/* Charts Row: Revenue Trend + Revenue by Category */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <DashPanel id="panel-revenueTrend" title="Revenue Trend" icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-info">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941"/>
                </svg>
              }>
                <div style={{ height: "280px", position: "relative", overflow: "hidden" }}>
                  {/* @ts-expect-error - Web component custom element */}
                  <rb-chart
                    id="rb-revenueTrend"
                    report-id="dashboard-cfo"
                    component-id="revenueTrend"
                    api-base-url={rbConfig.apiBaseUrl}
                    embed-token={embedToken}
                    style={{ display: "block", width: "100%", height: "100%" }}
                  />
                </div>
              </DashPanel>
              <DashPanel id="panel-revenueByCategory" title="Revenue by Category" icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-purple-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z"/>
                </svg>
              }>
                <div style={{ height: "280px", position: "relative", overflow: "hidden" }}>
                  {/* @ts-expect-error - Web component custom element */}
                  <rb-chart
                    id="rb-revenueByCategory"
                    report-id="dashboard-cfo"
                    component-id="revenueByCategory"
                    api-base-url={rbConfig.apiBaseUrl}
                    embed-token={embedToken}
                    style={{ display: "block", width: "100%", height: "100%" }}
                  />
                </div>
              </DashPanel>
            </div>

            {/* Bottom Row: Customers + AR Aging + Country */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <DashPanel id="panel-topCustomers" title="Top 5 Customers" icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-cyan-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/>
                </svg>
              }>
                {/* @ts-expect-error - Web component custom element */}
                <rb-tabulator
                  id="rb-topCustomers"
                  report-id="dashboard-cfo"
                  component-id="topCustomers"
                  api-base-url={rbConfig.apiBaseUrl}
                  embed-token={embedToken}
                  style={{ display: "block", width: "100%" }}
                />
              </DashPanel>
              <DashPanel id="panel-arAging" title="Accounts Receivable Aging" icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-warning">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                </svg>
              }>
                <div style={{ height: "280px", position: "relative", overflow: "hidden" }}>
                  {/* @ts-expect-error - Web component custom element */}
                  <rb-chart
                    id="rb-arAging"
                    report-id="dashboard-cfo"
                    component-id="arAging"
                    api-base-url={rbConfig.apiBaseUrl}
                    embed-token={embedToken}
                    style={{ display: "block", width: "100%", height: "100%" }}
                  />
                </div>
              </DashPanel>
              <DashPanel id="panel-revenueByCountry" title="Revenue by Country" icon={
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-pink-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/>
                </svg>
              }>
                <div style={{ height: "280px", position: "relative", overflow: "hidden" }}>
                  {/* @ts-expect-error - Web component custom element */}
                  <rb-chart
                    id="rb-revenueByCountry"
                    report-id="dashboard-cfo"
                    component-id="revenueByCountry"
                    api-base-url={rbConfig.apiBaseUrl}
                    embed-token={embedToken}
                    style={{ display: "block", width: "100%", height: "100%" }}
                  />
                </div>
              </DashPanel>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function KpiCard({
  id,
  label,
  value,
  detail,
  borderColor,
  valueSize = "text-2xl",
  valueHtml = false,
}: {
  id: string
  label: string
  value: string
  detail: React.ReactNode
  borderColor: string
  valueSize?: string
  valueHtml?: boolean
}) {
  return (
    <div id={id} className={`border border-base-300 rounded-lg p-5 border-l-4 ${borderColor} bg-base-100 transition-all hover:-translate-y-0.5 hover:shadow-md`}>
      <div className="text-[0.7rem] uppercase tracking-wider text-base-content/60 mb-1">{label}</div>
      {valueHtml ? (
        <div className={`${valueSize} font-bold text-base-content mb-2`} dangerouslySetInnerHTML={{ __html: "Côte de Blaye" }} />
      ) : (
        <div className={`${valueSize} font-bold text-base-content mb-2`}>{value}</div>
      )}
      <div className="text-xs text-base-content/60">{detail}</div>
    </div>
  )
}

function DashPanel({
  id,
  title,
  icon,
  children,
}: {
  id: string
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div id={id} className="border border-base-300 rounded-lg p-5 bg-base-100">
      <h6 className="font-semibold text-sm text-base-content mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h6>
      {children}
    </div>
  )
}
