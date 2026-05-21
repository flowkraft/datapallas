"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface Invoice {
  id: number
  invoiceNumber: string
  customerId: string
  customerName: string
  customerEmail?: string
  customerAddress?: string
  issueDate: string
  dueDate: string
  subtotal: number
  taxRate: number
  taxAmount: number
  discount: number
  totalAmount: number
  currency: string
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
  notes?: string
  paidAt?: string
  paymentMethod?: string
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

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

export default function PortalInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/invoices/${id}`)
      .then(r => {
        if (r.ok) return r.json()
        router.push("/portal/invoices")
        return null
      })
      .then(data => { if (data) setInvoice(data) })
      .catch(() => router.push("/portal/invoices"))
      .finally(() => setLoading(false))
  }, [id, router])

  if (loading) {
    return <div className="flex justify-center py-12"><span className="loading loading-spinner loading-lg"></span></div>
  }

  if (!invoice) {
    return <div className="text-center py-12 text-base-content/60">Invoice not found</div>
  }

  const isPayable = invoice.status === "sent" || invoice.status === "overdue"
  const isOverdue = invoice.status === "overdue"

  return (
    <div className="container mx-auto">
      {/* Breadcrumb */}
      <div className="breadcrumbs text-sm mb-4">
        <ul>
          <li><Link href="/portal/invoices">My Invoices</Link></li>
          <li>{invoice.invoiceNumber}</li>
        </ul>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8">
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body">
              <div className="flex justify-between items-center mb-2">
                <h2 className="card-title text-base text-base-content">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-2 text-base-content/60">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
                  </svg>
                  {invoice.invoiceNumber}
                </h2>
                <span className={statusBadgeClass(invoice.status)}>
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </span>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <dl className="grid grid-cols-2 gap-1 mb-0">
                  <dt className="text-base-content/60">Issue Date</dt>
                  <dd className="text-base-content">{formatDate(invoice.issueDate)}</dd>
                </dl>
                <dl className="grid grid-cols-2 gap-1 mb-0">
                  <dt className="text-base-content/60">Due Date</dt>
                  <dd className={isOverdue ? 'text-error font-bold' : 'text-base-content'}>
                    {formatDate(invoice.dueDate)}
                    {isOverdue && <span className="badge badge-error ml-2">Overdue</span>}
                  </dd>
                </dl>
              </div>

              <hr className="border-base-300"/>

              {/* Amount Details */}
              <h6 className="text-base-content/60 mb-3 mt-3">Amount Details</h6>
              <div className="overflow-x-auto">
                <table className="table">
                  <tbody>
                    <tr>
                      <td className="text-base-content/60">Subtotal</td>
                      <td className="text-right text-base-content">{formatAmount(invoice.subtotal, invoice.currency)}</td>
                    </tr>
                    <tr>
                      <td className="text-base-content/60">Tax ({invoice.taxRate}%)</td>
                      <td className="text-right text-base-content">{formatAmount(invoice.taxAmount, invoice.currency)}</td>
                    </tr>
                    {invoice.discount > 0 && (
                      <tr>
                        <td className="text-base-content/60">Discount</td>
                        <td className="text-right text-error">- {formatAmount(invoice.discount, invoice.currency)}</td>
                      </tr>
                    )}
                    <tr className="border-t border-base-300">
                      <td className="font-bold text-lg text-base-content">Total Amount</td>
                      <td className="text-right font-bold text-2xl text-base-content">{formatAmount(invoice.totalAmount, invoice.currency)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Notes */}
              {invoice.notes && (
                <>
                  <hr className="border-base-300"/>
                  <h6 className="text-base-content/60 mb-3 mt-3">Notes</h6>
                  <p className="text-base-content/60">{invoice.notes}</p>
                </>
              )}

              {/* Payment Info (if paid) */}
              {invoice.status === "paid" && (
                <>
                  <hr className="border-base-300"/>
                  <div className="alert alert-success mb-0 mt-3">
                    <h6 className="font-bold">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                      </svg>
                      Payment Received
                    </h6>
                    {invoice.paymentMethod && <p className="mb-1"><strong>Method:</strong> {invoice.paymentMethod}</p>}
                    {invoice.paidAt && <p className="mb-0"><strong>Date:</strong> {formatDate(invoice.paidAt)}</p>}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="md:col-span-4 space-y-4">
          {/* Payment Card */}
          {isPayable && (
            <div className="card bg-success text-success-content">
              <div className="card-body">
                <h2 className="card-title text-base">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/>
                  </svg>
                  Pay Invoice
                </h2>
                <div className="text-center mb-3">
                  <span className="text-3xl font-bold">{formatAmount(invoice.totalAmount, invoice.currency)}</span>
                  <p className="mb-0">Amount Due</p>
                </div>
                <Link href={`/portal/invoices/${invoice.id}/pay`} className="btn btn-success w-full btn-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/>
                  </svg>{" "}Pay Now
                </Link>
                <p className="text-sm text-center mt-3 mb-0" style={{opacity:0.8}}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/>
                  </svg>
                  Secure payment via Stripe or PayPal
                </p>
              </div>
            </div>
          )}

          {/* Download Card */}
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body">
              <h2 className="card-title text-base text-base-content">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-2 text-base-content/60">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/>
                </svg>
                Download
              </h2>
              <p className="text-base-content/60 mb-3">Download your invoice as a PDF document.</p>
              <a href={`/api/invoices/${invoice.id}/download`} className="btn btn-outline w-full">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
                </svg>{" "}Download PDF
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
