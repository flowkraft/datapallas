"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface Invoice {
  id: number
  invoiceNumber: string
  customerName: string
  issueDate: string
  dueDate: string
  totalAmount: number
  currency: string
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "paid": return "badge badge-success"
    case "overdue": return "badge badge-error"
    case "sent": return "badge badge-info"
    case "cancelled": return "badge badge-ghost"
    default: return "badge badge-ghost"
  }
}

function isPayable(status: string) {
  return status === "sent" || status === "overdue"
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/invoices?limit=100")
      .then(r => r.ok ? r.json() : { data: [] })
      .then(json => setInvoices(json.data || []))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-bold mb-1 text-base-content">My Invoices</h2>
          <p className="text-base-content/60 mb-0">View, pay, and download your invoices</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : invoices.length === 0 ? (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body text-center py-5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" style={{width:'3rem',height:'3rem',display:'block',margin:'0 auto 0.75rem',opacity:0.4}}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z"/>
            </svg>
            <h5 className="text-base-content">No Invoices Yet</h5>
            <p className="text-base-content/60 mb-0">Your invoices will appear here once they are issued.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="card bg-base-100 border border-base-300 h-full">
              <div className="card-body">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 text-base-content/60">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
                    </svg>
                  </div>
                  <span className={statusBadgeClass(invoice.status)}>
                    {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                  </span>
                </div>

                <h5 className="card-title font-bold text-base-content">{invoice.invoiceNumber}</h5>
                <p className="text-base-content/60 text-sm mb-2">
                  Due: <span className={invoice.status === 'overdue' ? 'text-error font-medium' : ''}>
                    {formatDate(invoice.dueDate)}
                  </span>
                </p>

                <div className="flex justify-between items-center mb-3">
                  <span className="text-base-content/60">Total</span>
                  <span className="text-2xl font-bold text-base-content">{formatAmount(invoice.totalAmount, invoice.currency)}</span>
                </div>

                <div className="grid gap-2">
                  <Link href={`/portal/invoices/${invoice.id}`} className="btn btn-outline btn-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-1">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
                    </svg>{" "}View Details
                  </Link>
                  {isPayable(invoice.status) ? (
                    <Link href={`/portal/invoices/${invoice.id}/pay`} className="btn btn-success btn-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-1">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/>
                      </svg>{" "}Pay Now
                    </Link>
                  ) : invoice.status === "paid" ? (
                    <button className="btn btn-outline btn-success btn-sm" disabled>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-1">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                      </svg>{" "}Paid
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="card-footer bg-transparent px-6 pb-4">
                <small className="text-base-content/60">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>
                  </svg>
                  Issued: {formatDate(invoice.issueDate)}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
