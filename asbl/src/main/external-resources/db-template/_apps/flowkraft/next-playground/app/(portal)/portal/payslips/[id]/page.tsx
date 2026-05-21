"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface Payslip {
  id: number
  payslipNumber: string
  employeeId: string
  employeeName: string
  employeeEmail?: string
  department?: string
  payPeriodStart: string
  payPeriodEnd: string
  grossAmount: number
  deductions: number
  netAmount: number
  currency: string
  status: "draft" | "sent" | "viewed" | "downloaded"
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
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

export default function PortalPayslipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [payslip, setPayslip] = useState<Payslip | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/payslips/${id}`)
      .then(r => {
        if (r.ok) return r.json()
        router.push("/portal/payslips")
        return null
      })
      .then(data => { if (data) setPayslip(data) })
      .catch(() => router.push("/portal/payslips"))
      .finally(() => setLoading(false))
  }, [id, router])

  if (loading) {
    return <div className="flex justify-center py-12"><span className="loading loading-spinner loading-lg"></span></div>
  }

  if (!payslip) {
    return <div className="text-center py-12 text-base-content/60">Payslip not found</div>
  }

  return (
    <div className="container mx-auto">
      {/* Breadcrumb */}
      <div className="breadcrumbs text-sm mb-4">
        <ul>
          <li><Link href="/portal/payslips">My Payslips</Link></li>
          <li>{payslip.payslipNumber}</li>
        </ul>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8">
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body">
              <div className="flex justify-between items-center mb-2">
                <h2 className="card-title text-base text-base-content">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-2 text-base-content/60">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185ZM9.75 9h.008v.008H9.75V9Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 4.5h.008v.008h-.008V13.5Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/>
                  </svg>
                  {payslip.payslipNumber}
                </h2>
                <span className={statusBadgeClass(payslip.status)}>
                  {payslip.status.charAt(0).toUpperCase() + payslip.status.slice(1)}
                </span>
              </div>

              {/* Employee Info */}
              <h6 className="text-base-content/60 mb-3">Employee Information</h6>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <dl className="grid grid-cols-2 gap-1 mb-0">
                  <dt className="text-base-content/60">Name</dt>
                  <dd className="text-base-content">{payslip.employeeName}</dd>
                  <dt className="text-base-content/60">Email</dt>
                  <dd className="text-base-content">{payslip.employeeEmail || '-'}</dd>
                </dl>
                <dl className="grid grid-cols-2 gap-1 mb-0">
                  <dt className="text-base-content/60">ID</dt>
                  <dd className="text-base-content">{payslip.employeeId}</dd>
                  <dt className="text-base-content/60">Department</dt>
                  <dd className="text-base-content">{payslip.department || '-'}</dd>
                </dl>
              </div>

              <hr className="border-base-300"/>

              {/* Pay Period */}
              <h6 className="text-base-content/60 mb-3 mt-3">Pay Period</h6>
              <p className="mb-4 text-base-content">
                {formatDate(payslip.payPeriodStart)}
                <span className="mx-2">—</span>
                {formatDate(payslip.payPeriodEnd)}
              </p>

              <hr className="border-base-300"/>

              {/* Payment Details */}
              <h6 className="text-base-content/60 mb-3 mt-3">Payment Details</h6>
              <div className="overflow-x-auto">
                <table className="table">
                  <tbody>
                    <tr>
                      <td className="text-base-content/60">Gross Amount</td>
                      <td className="text-right text-base-content">{formatAmount(payslip.grossAmount, payslip.currency)}</td>
                    </tr>
                    <tr>
                      <td className="text-base-content/60">Deductions</td>
                      <td className="text-right text-error">- {formatAmount(payslip.deductions, payslip.currency)}</td>
                    </tr>
                    <tr className="border-t border-base-300">
                      <td className="font-bold text-lg text-base-content">Net Amount</td>
                      <td className="text-right font-bold text-2xl text-success">{formatAmount(payslip.netAmount, payslip.currency)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-4">
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body">
              <h2 className="card-title text-base text-base-content">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="inline-block w-4 h-4 mr-2 text-base-content/60">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/>
                </svg>
                Download
              </h2>
              <p className="text-base-content/60 mb-3">Download your payslip as a PDF document for your records.</p>
              <a href={`/api/payslips/${payslip.id}/download`} className="btn btn-primary w-full">
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
