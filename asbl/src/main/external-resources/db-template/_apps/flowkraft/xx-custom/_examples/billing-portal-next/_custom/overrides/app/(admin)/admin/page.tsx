import Link from "next/link";
import { count, eq, desc } from "drizzle-orm";
import { db, bpInvoice, bpCustomer } from "@/lib/db";
import { money, fmtDate, statusBadge } from "@/lib/format";

const cnt = (col?: (typeof bpInvoice.status) | undefined, val?: string) =>
  val
    ? db.select({ c: count() }).from(bpInvoice).where(eq(bpInvoice.status, val as "PAID" | "DUE" | "OVERDUE")).all()[0].c
    : 0;

export default async function AdminDashboard() {
  const invoiceCount = db.select({ c: count() }).from(bpInvoice).all()[0].c;
  const customerCount = db.select({ c: count() }).from(bpCustomer).all()[0].c;
  const paidCount = cnt(undefined, "PAID");
  const dueCount = cnt(undefined, "DUE");
  const overdueCount = cnt(undefined, "OVERDUE");
  const recent = db.select().from(bpInvoice).orderBy(desc(bpInvoice.id)).limit(8).all();
  const customerName = (id: number) => db.select().from(bpCustomer).where(eq(bpCustomer.id, id)).all()[0]?.name ?? "";

  return (
    <div>
      <div className="mb-6"><h1 className="text-2xl font-bold">Dashboard</h1><p className="text-base-content/60">Billing overview.</p></div>

      <div className="stats stats-vertical sm:stats-horizontal w-full mb-6 border border-base-300">
        <div className="stat"><div className="stat-title">Invoices</div><div id="admin-invoice-count" className="stat-value">{invoiceCount}</div></div>
        <div className="stat"><div className="stat-title">Customers</div><div id="admin-customer-count" className="stat-value">{customerCount}</div></div>
        <div className="stat"><div className="stat-title">Paid</div><div id="admin-paid-count" className="stat-value">{paidCount}</div></div>
        <div className="stat"><div className="stat-title">Due</div><div id="admin-due-count" className="stat-value">{dueCount}</div></div>
        <div className="stat"><div className="stat-title">Overdue</div><div id="admin-overdue-count" className="stat-value">{overdueCount}</div></div>
      </div>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <div className="flex justify-between items-center mb-2">
            <h2 className="card-title">Recent invoices</h2>
            <div className="flex gap-2">
              <Link href="/admin/invoices" className="btn btn-ghost btn-sm">All invoices</Link>
              <Link id="btn-new-invoice" href="/admin/invoices/new" className="btn btn-primary btn-sm">New invoice</Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Status</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {recent.map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-medium">{inv.invoiceNumber}</td>
                    <td>{customerName(inv.customerId)}</td>
                    <td>{fmtDate(inv.dueDate)}</td>
                    <td><span className={`badge ${statusBadge(inv.status)}`}>{inv.status}</span></td>
                    <td className="text-right font-semibold">{money(inv.total)}</td>
                  </tr>
                ))}
                {recent.length === 0 ? <tr><td colSpan={5} className="text-center text-base-content/50 py-6">No invoices yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
