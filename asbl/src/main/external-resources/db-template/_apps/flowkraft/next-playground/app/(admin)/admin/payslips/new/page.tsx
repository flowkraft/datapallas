"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"

export default function NewPayslipPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    payslipNumber: "",
    employeeId: "",
    employeeName: "",
    employeeEmail: "",
    department: "",
    payPeriodStart: "",
    payPeriodEnd: "",
    grossAmount: "",
    deductions: "0",
    netAmount: "",
    currency: "USD",
    status: "draft",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => {
      const updated = { ...prev, [name]: value }
      
      // Auto-calculate net amount
      if (name === "grossAmount" || name === "deductions") {
        const gross = parseFloat(updated.grossAmount) || 0
        const deductions = parseFloat(updated.deductions) || 0
        updated.netAmount = (gross - deductions).toFixed(2)
      }
      
      return updated
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch("/api/payslips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        toast({ title: "Payslip created", duration: 3000 })
        router.push("/admin/payslips")
      } else {
        const error = await res.json()
        toast({ title: error.error || "Failed to create payslip", variant: "destructive", duration: 3000 })
      }
    } catch (error) {
      console.error("Error creating payslip:", error)
      toast({ title: "Failed to create payslip", variant: "destructive", duration: 3000 })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/payslips">
          <Button variant="ghost" size="icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/>
            </svg>
          </Button>
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-base-content">New Payslip</h2>
          <p className="text-base-content/60">
            Create a new employee payslip
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payslip Details</CardTitle>
          <CardDescription>
            Fill in the payslip information below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="payslipNumber">Payslip Number *</Label>
                <Input
                  id="payslipNumber"
                  name="payslipNumber"
                  value={formData.payslipNumber}
                  onChange={handleChange}
                  placeholder="PAY-2024-001"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="viewed">Viewed</option>
                  <option value="downloaded">Downloaded</option>
                </Select>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-medium mb-4">Employee Information</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="employeeId">Employee ID *</Label>
                  <Input
                    id="employeeId"
                    name="employeeId"
                    value={formData.employeeId}
                    onChange={handleChange}
                    placeholder="EMP-001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employeeName">Employee Name *</Label>
                  <Input
                    id="employeeName"
                    name="employeeName"
                    value={formData.employeeName}
                    onChange={handleChange}
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employeeEmail">Email</Label>
                  <Input
                    id="employeeEmail"
                    name="employeeEmail"
                    type="email"
                    value={formData.employeeEmail}
                    onChange={handleChange}
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    placeholder="Engineering"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-medium mb-4">Pay Period</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="payPeriodStart">Period Start *</Label>
                  <Input
                    id="payPeriodStart"
                    name="payPeriodStart"
                    type="date"
                    value={formData.payPeriodStart}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payPeriodEnd">Period End *</Label>
                  <Input
                    id="payPeriodEnd"
                    name="payPeriodEnd"
                    type="date"
                    value={formData.payPeriodEnd}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-medium mb-4">Payment Details</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="grossAmount">Gross Amount *</Label>
                  <Input
                    id="grossAmount"
                    name="grossAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.grossAmount}
                    onChange={handleChange}
                    placeholder="5000.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deductions">Deductions</Label>
                  <Input
                    id="deductions"
                    name="deductions"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.deductions}
                    onChange={handleChange}
                    placeholder="500.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="netAmount">Net Amount</Label>
                  <Input
                    id="netAmount"
                    name="netAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.netAmount}
                    onChange={handleChange}
                    placeholder="4500.00"
                    readOnly
                    className="bg-base-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    id="currency"
                    name="currency"
                    value={formData.currency}
                    onChange={handleChange}
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="JPY">JPY</option>
                    <option value="CAD">CAD</option>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <Link href="/admin/payslips">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button id="btn-submit" type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Payslip"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
