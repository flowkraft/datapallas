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
import { InvoicePayment } from "@/components/payments"

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
  paymentReference?: string
  createdAt: string
  updatedAt: string
}

const statusBadgeClass: Record<string, string> = {
  draft:     "badge badge-ghost",
  sent:      "badge badge-info",
  paid:      "badge badge-success",
  overdue:   "badge badge-error",
  cancelled: "badge badge-ghost",
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchInvoice() }, [id])

  const fetchInvoice = async () => {
    try {
      const res = await fetch(`/api/invoices/${id}`)
      if (res.ok) setInvoice(await res.json())
      else router.push("/admin/invoices")
    } catch { router.push("/admin/invoices") }
    finally { setLoading(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" })
      if (res.ok) router.push("/admin/invoices")
      else alert("Failed to delete invoice")
    } catch { alert("Failed to delete invoice") }
    finally { setDeleting(false); setDeleteDialogOpen(false) }
  }

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-base-content/60">Loading...</div></div>
  if (!invoice) return <div className="flex items-center justify-center h-64"><div className="text-base-content/60">Invoice not found</div></div>

  return (
    <div className="space-y-6">
      {/* Status Banners */}
      {invoice.status === "paid" && (
        <div className="flex items-center gap-3 p-4 bg-success/10 border border-success/30 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6 text-success">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
          </svg>
          <div>
            <p className="font-semibold text-base-content">Payment Received</p>
            <p className="text-sm text-base-content/60">
              This invoice was paid{invoice.paidAt ? ` on ${formatDate(invoice.paidAt)}` : ""}{invoice.paymentMethod ? ` via ${invoice.paymentMethod}` : ""}
            </p>
          </div>
        </div>
      )}
      {invoice.status === "overdue" && (
        <div className="flex items-center gap-3 p-4 bg-error/10 border border-error/30 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6 text-error">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
          </svg>
          <div>
            <p className="font-semibold text-base-content">Payment Overdue</p>
            <p className="text-sm text-base-content/60">This invoice was due on {formatDate(invoice.dueDate)}</p>
          </div>
        </div>
      )}
      {(invoice.status === "sent" || invoice.status === "draft") && (
        <div className="flex items-center gap-3 p-4 bg-info/10 border border-info/30 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6 text-info">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
          </svg>
          <div>
            <p className="font-semibold text-base-content">{invoice.status === "draft" ? "Draft Invoice" : "Awaiting Payment"}</p>
            <p className="text-sm text-base-content/60">Due date: {formatDate(invoice.dueDate)}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/invoices">
            <Button variant="ghost" size="icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>
              </svg>
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold tracking-tight text-base-content">{invoice.invoiceNumber}</h2>
              <span className={statusBadgeClass[invoice.status]}>{invoice.status}</span>
            </div>
            <p className="text-base-content/60">{invoice.customerName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {invoice.status !== "paid" && invoice.status !== "cancelled" && (
            <InvoicePayment invoiceId={invoice.id} amount={Math.round(invoice.totalAmount * 100)} currency={invoice.currency} onPaymentSuccess={() => fetchInvoice()} />
          )}
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
          <Link href={`/admin/invoices/${id}/edit`}>
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
          <CardHeader><CardTitle>Customer Information</CardTitle><CardDescription>Details about the customer</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-base-content/60">Customer ID</p><p className="font-medium text-base-content">{invoice.customerId}</p></div>
              <div><p className="text-sm text-base-content/60">Name</p><p className="font-medium text-base-content">{invoice.customerName}</p></div>
              <div><p className="text-sm text-base-content/60">Email</p><p className="font-medium text-base-content">{invoice.customerEmail || "-"}</p></div>
              <div><p className="text-sm text-base-content/60">Address</p><p className="font-medium text-base-content">{invoice.customerAddress || "-"}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Invoice Dates</CardTitle><CardDescription>Issue and due dates</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-base-content/60">Issue Date</p><p className="font-medium text-base-content">{formatDate(invoice.issueDate)}</p></div>
              <div><p className="text-sm text-base-content/60">Due Date</p><p className="font-medium text-base-content">{formatDate(invoice.dueDate)}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Payment Details</CardTitle><CardDescription>Breakdown of amounts</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2">
              <span className="text-base-content/60">Subtotal</span>
              <span className="font-medium text-base-content">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center py-2">
              <span className="text-base-content/60">Tax ({invoice.taxRate}%)</span>
              <span className="font-medium text-base-content">+{formatCurrency(invoice.taxAmount, invoice.currency)}</span>
            </div>
            {invoice.discount > 0 && (
              <><Separator />
              <div className="flex justify-between items-center py-2">
                <span className="text-base-content/60">Discount</span>
                <span className="font-medium text-success">-{formatCurrency(invoice.discount, invoice.currency)}</span>
              </div></>
            )}
            <Separator />
            <div className="flex justify-between items-center py-2">
              <span className="font-semibold text-base-content">Total Amount</span>
              <span className="font-bold text-lg text-primary">{formatCurrency(invoice.totalAmount, invoice.currency)}</span>
            </div>
            {invoice.status === "paid" && invoice.paidAt && (
              <><Separator />
              <div className="pt-4 space-y-3">
                <h4 className="text-sm font-semibold text-success">Payment Received</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-base-content/60">Paid On</p><p className="font-medium text-base-content">{formatDate(invoice.paidAt)}</p></div>
                  {invoice.paymentMethod && <div><p className="text-sm text-base-content/60">Payment Method</p><p className="font-medium text-base-content capitalize">{invoice.paymentMethod}</p></div>}
                  {invoice.paymentReference && <div className="col-span-2"><p className="text-sm text-base-content/60">Transaction Reference</p><p className="font-medium text-base-content font-mono text-xs">{invoice.paymentReference}</p></div>}
                </div>
              </div></>
            )}
          </div>
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle><CardDescription>Additional information</CardDescription></CardHeader>
          <CardContent><p className="text-base-content/60 whitespace-pre-wrap">{invoice.notes}</p></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Record Information</CardTitle><CardDescription>System metadata</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-sm text-base-content/60">Created</p><p className="font-medium text-base-content">{formatDate(invoice.createdAt)}</p></div>
            <div><p className="text-sm text-base-content/60">Last Updated</p><p className="font-medium text-base-content">{formatDate(invoice.updatedAt)}</p></div>
            <div><p className="text-sm text-base-content/60">Status</p><p className="font-medium text-base-content capitalize">{invoice.status}</p></div>
            <div><p className="text-sm text-base-content/60">Currency</p><p className="font-medium text-base-content">{invoice.currency}</p></div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>Are you sure you want to delete invoice {invoice.invoiceNumber}? This action cannot be undone.</DialogDescription>
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
