"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface Stats {
  totalPayslips: number
  totalInvoices: number
  totalRevenue: number
  pendingPayments: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalPayslips: 0,
    totalInvoices: 0,
    totalRevenue: 0,
    pendingPayments: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/stats")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setStats(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 id="admin-page-title" className="text-xl font-semibold text-base-content">Dashboard</h1>
        <p className="text-base-content/60 text-sm mt-1">Manage payslips and invoices</p>
      </div>

      {/* Stats Cards */}
      <div id="admin-stats-grid" className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div id="stat-card-payslips" className="card bg-base-100 border border-base-300">
          <div className="card-body p-4">
            <div className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-medium uppercase tracking-wide text-base-content/60">Payslips</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-base-content/40">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185ZM9.75 9h.008v.008H9.75V9Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 4.5h.008v.008h-.008V13.5Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/>
              </svg>
            </div>
            <div id="stat-value-payslips" className="text-2xl font-semibold text-base-content">
              {loading ? "..." : stats.totalPayslips}
            </div>
          </div>
        </div>

        <div id="stat-card-invoices" className="card bg-base-100 border border-base-300">
          <div className="card-body p-4">
            <div className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-medium uppercase tracking-wide text-base-content/60">Invoices</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-base-content/40">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
              </svg>
            </div>
            <div id="stat-value-invoices" className="text-2xl font-semibold text-base-content">
              {loading ? "..." : stats.totalInvoices}
            </div>
          </div>
        </div>

        <div id="stat-card-revenue" className="card bg-base-100 border border-base-300">
          <div className="card-body p-4">
            <div className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-medium uppercase tracking-wide text-base-content/60">Revenue</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-base-content/40">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
              </svg>
            </div>
            <div id="stat-value-revenue" className="text-2xl font-semibold text-base-content">
              {loading ? "..." : `$${stats.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>
          </div>
        </div>

        <div id="stat-card-pending" className="card bg-base-100 border border-base-300">
          <div className="card-body p-4">
            <div className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-medium uppercase tracking-wide text-base-content/60">Pending</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 text-base-content/40">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
              </svg>
            </div>
            <div id="stat-value-pending" className="text-2xl font-semibold text-base-content">
              {loading ? "..." : stats.pendingPayments}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div id="admin-quick-actions" className="grid gap-3 md:grid-cols-2">
        <div id="quick-actions-payslips" className="card bg-base-100 border border-base-300">
          <div className="card-body p-4">
            <div className="card-title text-sm font-medium text-base-content mb-2">Payslips</div>
            <div className="flex gap-2">
              <Link
                id="btn-view-payslips"
                href="/admin/payslips"
                className="btn btn-sm btn-neutral"
              >
                View All
              </Link>
              <Link
                id="btn-new-payslip"
                href="/admin/payslips/new"
                className="btn btn-sm btn-outline"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3 mr-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                New
              </Link>
            </div>
          </div>
        </div>

        <div id="quick-actions-invoices" className="card bg-base-100 border border-base-300">
          <div className="card-body p-4">
            <div className="card-title text-sm font-medium text-base-content mb-2">Invoices</div>
            <div className="flex gap-2">
              <Link
                id="btn-view-invoices"
                href="/admin/invoices"
                className="btn btn-sm btn-neutral"
              >
                View All
              </Link>
              <Link
                id="btn-new-invoice"
                href="/admin/invoices/new"
                className="btn btn-sm btn-outline"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3 w-3 mr-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                New
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
