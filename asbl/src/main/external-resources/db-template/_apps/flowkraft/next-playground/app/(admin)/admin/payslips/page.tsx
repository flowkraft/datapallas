"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

type PayslipStatus = "draft" | "sent" | "viewed" | "downloaded"

interface Payslip {
  id: number
  payslipNumber: string
  employeeId: string
  employeeName: string
  department: string | null
  payPeriodStart: string
  payPeriodEnd: string
  grossAmount: number
  netAmount: number
  currency: string
  status: PayslipStatus
}

const getStatusStyle = (status: PayslipStatus) => {
  switch (status) {
    case "viewed":
    case "downloaded": return "badge badge-success"
    case "sent":       return "badge badge-info"
    default:           return "badge badge-ghost"
  }
}

export default function PayslipsPage() {
  const { toast } = useToast()
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const pageSize = 25

  const fetchPayslips = useCallback(async (currentPage: number, currentSearch: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(pageSize) })
      if (currentSearch) params.set("search", currentSearch)
      const res = await fetch(`/api/payslips?${params}`)
      if (res.ok) {
        const json = await res.json()
        setPayslips(json.data)
        setTotal(json.total)
        setTotalPages(json.totalPages)
      }
    } catch (error) {
      console.error("Error fetching payslips:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPayslips(page, search) }, [page, fetchPayslips])
  useEffect(() => { setPage(1); fetchPayslips(1, search) }, [search, fetchPayslips])

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const res = await fetch(`/api/payslips/${deleteId}`, { method: "DELETE" })
      if (res.ok) {
        fetchPayslips(page, search)
        toast({ title: "Payslip deleted", duration: 3000 })
      } else {
        toast({ title: "Failed to delete payslip", variant: "destructive", duration: 3000 })
      }
    } catch (error) {
      console.error("Error deleting payslip:", error)
      toast({ title: "Failed to delete payslip", variant: "destructive", duration: 3000 })
    } finally {
      setDeleteId(null)
    }
  }

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })

  const showingFrom = total > 0 ? (page - 1) * pageSize + 1 : 0
  const showingTo = Math.min(page * pageSize, total)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div id="payslips-header" className="flex items-center justify-between">
        <h1 id="payslips-page-title" className="text-xl font-semibold text-base-content">Payslips</h1>
        <Link href="/admin/payslips/new">
          <Button id="btn-new-payslip" size="sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="mr-1.5 h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            New
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div id="payslips-search">
        <Input
          id="payslips-search-input"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
      </div>

      {/* Table */}
      <div id="payslips-table-card" className="rounded border border-base-300 bg-base-100 overflow-hidden">
        <Table id="payslips-table">
          <TableHeader>
            <TableRow className="bg-base-200 border-b border-base-300">
              <TableHead className="text-xs uppercase tracking-wide text-base-content/60">Payslip</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-base-content/60">Employee</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-base-content/60">Dept</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-base-content/60">Period</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide text-base-content/60">Net</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-base-content/60">Status</TableHead>
              <TableHead className="w-52"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-sm text-base-content/60">Loading...</TableCell>
              </TableRow>
            ) : payslips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-sm text-base-content/60">No payslips found.</TableCell>
              </TableRow>
            ) : (
              payslips.map((payslip) => (
                <TableRow key={payslip.id} className="border-b border-base-200 hover:bg-base-200/50">
                  <TableCell className="text-sm font-medium text-base-content">{payslip.payslipNumber}</TableCell>
                  <TableCell>
                    <div className="text-sm text-base-content">{payslip.employeeName}</div>
                    <div className="text-xs text-base-content/40">{payslip.employeeId}</div>
                  </TableCell>
                  <TableCell className="text-sm text-base-content/60">{payslip.department || "-"}</TableCell>
                  <TableCell className="text-sm text-base-content/60">
                    {formatDate(payslip.payPeriodStart)} - {formatDate(payslip.payPeriodEnd)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium text-base-content">
                    {formatCurrency(payslip.netAmount, payslip.currency)}
                  </TableCell>
                  <TableCell>
                    <span className={getStatusStyle(payslip.status)}>{payslip.status}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-0.5">
                      <Link href={`/admin/payslips/${payslip.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 px-2">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="mr-1 h-3.5 w-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
                          </svg> View
                        </Button>
                      </Link>
                      <Link href={`/admin/payslips/${payslip.id}/edit`}>
                        <Button variant="ghost" size="sm" className="h-7 px-2 btn-edit">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="mr-1 h-3.5 w-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/>
                          </svg> Edit
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 hover:text-error btn-delete"
                        onClick={() => setDeleteId(payslip.id)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="mr-1 h-3.5 w-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
                        </svg> Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex justify-between items-center mt-3 px-1" id="pagination-controls">
          <span className="text-sm text-base-content/60" id="pagination-info">
            Showing {showingFrom}-{showingTo} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" id="btn-prev-page" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" id="btn-next-page" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent id="deleteModal" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Payslip</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button id="btn-confirm-delete" variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
