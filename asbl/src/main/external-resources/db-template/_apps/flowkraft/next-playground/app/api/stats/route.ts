import { NextResponse } from "next/server";
import { db, invoices, payslips } from "@/lib/db";
import { count, sum, eq, inArray } from "drizzle-orm";

// GET /api/stats - Dashboard statistics
export async function GET() {
  try {
    // Get counts
    const [payslipCount] = await db.select({ count: count() }).from(payslips);
    const [invoiceCount] = await db.select({ count: count() }).from(invoices);
    
    // Get paid invoices total
    const [revenueResult] = await db
      .select({ total: sum(invoices.totalAmount) })
      .from(invoices)
      .where(eq(invoices.status, "paid"));
    
    // Get pending (draft + sent invoices and draft payslips)
    const [pendingInvoices] = await db
      .select({ count: count() })
      .from(invoices)
      .where(inArray(invoices.status, ["draft", "sent"]));
    
    const [draftPayslips] = await db
      .select({ count: count() })
      .from(payslips)
      .where(eq(payslips.status, "draft"));

    const stats = {
      totalPayslips: payslipCount.count,
      totalInvoices: invoiceCount.count,
      totalRevenue: Math.round((parseFloat(String(revenueResult.total)) || 0) * 100) / 100,
      pendingPayments: (pendingInvoices.count || 0) + (draftPayslips.count || 0),
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
