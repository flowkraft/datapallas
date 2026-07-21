import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, bpCustomer, bpInvoice } from "@/lib/db";
import { money, fmtDate, statusBadge } from "@/lib/format";
import { deleteCustomer, resetCustomerPassword } from "@/lib/actions";
import { DeleteCustomerButton, DeleteCustomerModal } from "@/components/billing/DeleteCustomer";

export default async function CustomerShow({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = db.select().from(bpCustomer).where(eq(bpCustomer.id, Number(id))).all()[0];
  if (!customer) return <div className="max-w-4xl mx-auto"><div className="alert alert-soft alert-error">Customer not found.</div></div>;
  const invoices = db.select().from(bpInvoice).where(eq(bpInvoice.customerId, customer.id)).all().sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <Link href="/admin/customers" className="btn btn-ghost btn-sm">← Customers</Link>
        <div className="flex gap-2">
          <Link id={`btn-edit-${customer.email}`} href={`/admin/customers/${customer.id}/edit`} className="btn btn-outline btn-sm">Edit</Link>
          {/* Its own little form, at the page's top level — NOT nested inside another one, which is
              invalid HTML and silently orphans everything after it on the Grails twin. */}
          <form action={resetCustomerPassword} className="inline">
            <input type="hidden" name="id" value={customer.id} />
            <button type="submit" id={`btn-reset-password-${customer.email}`} className="btn btn-outline btn-sm">Reset password</button>
          </form>
          <DeleteCustomerButton customerId={customer.id} customerEmail={customer.email} customerName={customer.name}
                                className="btn btn-error btn-outline btn-sm" />
        </div>
      </div>

      <div className="card bg-base-100 border border-base-300 mb-6">
        <div className="card-body">
          <h1 className="card-title">{customer.name}</h1>
          <div className="text-base-content/70">{customer.email}</div>
          <div className="text-base-content/70">{[customer.city, customer.country].filter(Boolean).join(", ")}</div>
        </div>
      </div>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <h2 className="card-title mb-2">Invoices</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Invoice</th><th>Due</th><th>Status</th><th className="text-right">Total</th><th></th></tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-medium">{inv.invoiceNumber}</td>
                    <td>{fmtDate(inv.dueDate)}</td>
                    <td><span className={`badge ${statusBadge(inv.status)}`}>{inv.status}</span></td>
                    <td className="text-right font-semibold">{money(inv.total)}</td>
                    <td className="text-right"><Link href={`/admin/invoices/${inv.id}`} className="btn btn-ghost btn-xs">View</Link></td>
                  </tr>
                ))}
                {invoices.length === 0 ? <tr><td colSpan={5} className="text-center text-base-content/50 py-6">No invoices.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DeleteCustomerModal action={deleteCustomer} />
    </div>
  );
}
