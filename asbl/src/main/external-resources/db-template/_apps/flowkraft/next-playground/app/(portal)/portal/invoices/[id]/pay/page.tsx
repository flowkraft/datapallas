"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { InvoicePayment } from "@/components/payments"

interface Invoice {
  id: number
  invoiceNumber: string
  totalAmount: number
  currency: string
  status: string
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
}

export default function PortalInvoicePayPage({ params }: { params: Promise<{ id: string }> }) {
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
      .then(data => {
        if (data) {
          // Redirect if not payable
          if (data.status !== "sent" && data.status !== "overdue") {
            router.push(`/portal/invoices/${id}`)
            return
          }
          setInvoice(data)
        }
      })
      .catch(() => router.push("/portal/invoices"))
      .finally(() => setLoading(false))
  }, [id, router])

  if (loading) {
    return <div className="flex justify-center py-12"><span className="loading loading-spinner loading-lg"></span></div>
  }

  if (!invoice) {
    return <div className="text-center py-12 text-base-content/60">Invoice not found</div>
  }

  return (
    <div className="container mx-auto">
      {/* Breadcrumb */}
      <div className="breadcrumbs text-sm mb-4">
        <ul>
          <li><Link href="/portal/invoices">My Invoices</Link></li>
          <li><Link href={`/portal/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link></li>
          <li>Pay</li>
        </ul>
      </div>

      <div className="flex justify-center">
        <div className="w-full max-w-lg">
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body">
              <h2 className="card-title text-base justify-center text-base-content">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/>
                </svg>
                Pay Invoice {invoice.invoiceNumber}
              </h2>

              {/* Invoice Summary */}
              <div className="text-center mb-4 pb-4 border-b border-base-300">
                <span className="text-5xl font-bold text-base-content">{formatAmount(invoice.totalAmount, invoice.currency)}</span>
                <p className="text-base-content/60 mb-0">Total Amount Due</p>
              </div>

              {/* Payment component */}
              <InvoicePayment
                invoiceId={invoice.id}
                amount={Math.round(invoice.totalAmount * 100)}
                currency={invoice.currency}
                onPaymentSuccess={() => router.push(`/portal/invoices/${invoice.id}`)}
              />

              {/* Security Note */}
              <p className="text-base-content/60 text-sm text-center mt-4 mb-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/>
                </svg>
                Your payment is secured with 256-bit SSL encryption
              </p>
            </div>
          </div>

          {/* Back link */}
          <div className="text-center mt-3">
            <Link href={`/portal/invoices/${invoice.id}`} className="text-base-content/60 no-underline hover:text-base-content">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>
              </svg>{" "}Back to Invoice
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
