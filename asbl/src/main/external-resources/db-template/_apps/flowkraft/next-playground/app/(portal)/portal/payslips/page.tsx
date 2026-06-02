"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface Payslip {
  id: number
  payslipNumber: string
  employeeName: string
  payPeriodStart: string
  payPeriodEnd: string
  netAmount: number
  currency: string
  status: "draft" | "sent" | "viewed" | "downloaded"
  createdAt: string
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "downloaded":
    case "viewed": return "badge badge-success"
    case "sent": return "badge badge-info"
    default: return "badge badge-ghost"
  }
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function payPeriodFormatted(start: string, end: string) {
  return `${formatDate(start)} — ${formatDate(end)}`
}

export default function PortalPayslipsPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/payslips?limit=100")
      .then(r => r.ok ? r.json() : { data: [] })
      .then(json => setPayslips(json.data || []))
      .catch(() => setPayslips([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-bold mb-1 text-base-content">My Payslips</h2>
          <p className="text-base-content/60 mb-0">View and download your salary statements</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : payslips.length === 0 ? (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body text-center py-5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" style={{width:'3rem',height:'3rem',display:'block',margin:'0 auto 0.75rem',opacity:0.4}}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z"/>
            </svg>
            <h5 className="text-base-content">No Payslips Yet</h5>
            <p className="text-base-content/60 mb-0">Your payslips will appear here once they are issued.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {payslips.map((payslip) => (
            <div key={payslip.id} className="card bg-base-100 border border-base-300 h-full">
              <div className="card-body">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 text-base-content/60">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185ZM9.75 9h.008v.008H9.75V9Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 4.5h.008v.008h-.008V13.5Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/>
                    </svg>
                  </div>
                  <span className={statusBadgeClass(payslip.status)}>
                    {payslip.status.charAt(0).toUpperCase() + payslip.status.slice(1)}
                  </span>
                </div>

                <h5 className="card-title font-bold text-base-content">{payslip.payslipNumber}</h5>
                <p className="text-base-content/60 text-sm mb-2">{payPeriodFormatted(payslip.payPeriodStart, payslip.payPeriodEnd)}</p>

                <div className="flex justify-between items-center mb-3">
                  <span className="text-base-content/60">Net Amount</span>
                  <span className="text-2xl font-bold text-success">{formatAmount(payslip.netAmount, payslip.currency)}</span>
                </div>

                <div className="grid gap-2">
                  <Link href={`/portal/payslips/${payslip.id}`} className="btn btn-outline btn-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-1">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
                    </svg>{" "}View Details
                  </Link>
                  <a href={`/api/payslips/${payslip.id}/download`} className="btn btn-primary btn-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-1">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/>
                    </svg>{" "}Download PDF
                  </a>
                </div>
              </div>
              <div className="card-footer bg-transparent px-6 pb-4">
                <small className="text-base-content/60">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>
                  </svg>
                  {formatDate(payslip.createdAt)}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
