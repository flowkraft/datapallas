"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
  createdAt: string
  updatedAt: string
}

const statusBadgeClass: Record<string, string> = {
  draft:      "badge badge-ghost",
  sent:       "badge badge-info",
  viewed:     "badge badge-warning",
  downloaded: "badge badge-success",
}

export default function PayslipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [payslip, setPayslip] = useState<Payslip | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchPayslip() }, [id])

  const fetchPayslip = async () => {
    try {
      const res = await fetch(`/api/payslips/${id}`)
      if (res.ok) setPayslip(await res.json())
      else router.push("/admin/payslips")
    } catch { router.push("/admin/payslips") }
    finally { setLoading(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/payslips/${id}`, { method: "DELETE" })
      if (res.ok) router.push("/admin/payslips")
      else alert("Failed to delete payslip")
    } catch { alert("Failed to delete payslip") }
    finally { setDeleting(false); setDeleteDialogOpen(false) }
  }

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-base-content/60">Loading...</div></div>
  if (!payslip) return <div className="flex items-center justify-center h-64"><div className="text-base-content/60">Payslip not found</div></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/payslips">
            <Button variant="ghost" size="icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>
              </svg>
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold tracking-tight text-base-content">{payslip.payslipNumber}</h2>
              <span className={statusBadgeClass[payslip.status]}>{payslip.status}</span>
            </div>
            <p className="text-base-content/60">{payslip.employeeName} • {payslip.department || "No department"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/>
            </svg>Send
          </Button>
          <Button variant="outline" size="sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/>
            </svg>Download
          </Button>
          <Link href={`/admin/payslips/${id}/edit`}>
            <Button variant="outline" size="sm">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 mr-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/>
              </svg>Edit
            </Button>
          </Link>
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
            </svg>Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Employee Information</CardTitle><CardDescription>Details about the employee</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-base-content/60">Employee ID</p><p className="font-medium text-base-content">{payslip.employeeId}</p></div>
              <div><p className="text-sm text-base-content/60">Name</p><p className="font-medium text-base-content">{payslip.employeeName}</p></div>
              <div><p className="text-sm text-base-content/60">Email</p><p className="font-medium text-base-content">{payslip.employeeEmail || "-"}</p></div>
              <div><p className="text-sm text-base-content/60">Department</p><p className="font-medium text-base-content">{payslip.department || "-"}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pay Period</CardTitle><CardDescription>Period covered by this payslip</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-base-content/60">Start Date</p><p className="font-medium text-base-content">{formatDate(payslip.payPeriodStart)}</p></div>
              <div><p className="text-sm text-base-content/60">End Date</p><p className="font-medium text-base-content">{formatDate(payslip.payPeriodEnd)}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Payment Details</CardTitle><CardDescription>Breakdown of earnings and deductions</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2">
              <span className="text-base-content/60">Gross Amount</span>
              <span className="font-medium text-base-content">{formatCurrency(payslip.grossAmount, payslip.currency)}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center py-2">
              <span className="text-base-content/60">Deductions</span>
              <span className="font-medium text-error">-{formatCurrency(payslip.deductions, payslip.currency)}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center py-2">
              <span className="font-semibold text-base-content">Net Amount</span>
              <span className="font-bold text-lg text-success">{formatCurrency(payslip.netAmount, payslip.currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Record Information</CardTitle><CardDescription>System metadata</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-sm text-base-content/60">Created</p><p className="font-medium text-base-content">{formatDate(payslip.createdAt)}</p></div>
            <div><p className="text-sm text-base-content/60">Last Updated</p><p className="font-medium text-base-content">{formatDate(payslip.updatedAt)}</p></div>
            <div><p className="text-sm text-base-content/60">Status</p><p className="font-medium text-base-content capitalize">{payslip.status}</p></div>
            <div><p className="text-sm text-base-content/60">Currency</p><p className="font-medium text-base-content">{payslip.currency}</p></div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payslip</DialogTitle>
            <DialogDescription>Are you sure you want to delete payslip {payslip.payslipNumber}? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
