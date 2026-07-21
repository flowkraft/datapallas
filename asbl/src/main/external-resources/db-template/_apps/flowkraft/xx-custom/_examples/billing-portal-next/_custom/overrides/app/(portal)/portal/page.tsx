import Link from "next/link";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, bpInvoice, bpCustomer } from "@/lib/db";
import { money, fmtDate, statusBadge } from "@/lib/format";

export default async function PortalHome() {
  const s = await getSession();
  const customer = s?.customerId ? db.select().from(bpCustomer).where(eq(bpCustomer.id, s.customerId)).all()[0] : null;
  const invoices = s?.customerId
    ? db.select().from(bpInvoice).where(eq(bpInvoice.customerId, s.customerId)).all().sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    : [];
  const paid = invoices.filter((i) => i.status === "PAID").length;
  const due = invoices.filter((i) => i.status === "DUE").length;
  const overdue = invoices.filter((i) => i.status === "OVERDUE").length;
  const outstanding = invoices.filter((i) => i.status !== "PAID").reduce((a, i) => a + (i.total || 0), 0);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Welcome, {customer?.name ?? "Customer"}</h1>
        <p className="text-base-content/60">Here&apos;s an overview of your account.</p>
      </div>

      <div className="stats stats-vertical sm:stats-horizontal w-full mb-6 border border-base-300">
        <div className="stat"><div className="stat-title">Outstanding</div><div className="stat-value text-primary">{money(outstanding)}</div><div className="stat-desc">{due + overdue} unpaid invoice(s)</div></div>
        <div className="stat"><div className="stat-title">Paid</div><div className="stat-value">{paid}</div></div>
        <div className="stat"><div className="stat-title">Due</div><div className="stat-value">{due}</div></div>
        <div className="stat"><div className="stat-title">Overdue</div><div className="stat-value">{overdue}</div></div>
      </div>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <div className="flex justify-between items-center mb-2">
            <h2 className="card-title">My Invoices</h2>
            <Link href="/portal/invoices" className="btn btn-ghost btn-sm">View all</Link>
          </div>
          <div className="overflow-x-auto">
            <table id="invoice-list" className="table">
              <thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th>Status</th><th className="text-right">Total</th><th></th></tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} id={`invoice-row-${inv.invoiceNumber}`}>
                    <td className="font-medium">{inv.invoiceNumber}</td>
                    <td>{fmtDate(inv.invoiceDate)}</td>
                    <td>{fmtDate(inv.dueDate)}</td>
                    <td><span id={`invoice-status-${inv.invoiceNumber}`} className={`badge ${statusBadge(inv.status)}`}>{inv.status}</span></td>
                    <td className="text-right font-semibold">{money(inv.total)}</td>
                    <td className="text-right">
                      <Link href={`/portal/invoices/${inv.id}`} className="btn btn-ghost btn-xs">View</Link>
                      {inv.status !== "PAID" ? <Link href={`/portal/invoices/${inv.id}/pay`} className="btn btn-primary btn-xs">Pay</Link> : null}
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 ? <tr><td colSpan={6} className="text-center text-base-content/50 py-6">No invoices yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
