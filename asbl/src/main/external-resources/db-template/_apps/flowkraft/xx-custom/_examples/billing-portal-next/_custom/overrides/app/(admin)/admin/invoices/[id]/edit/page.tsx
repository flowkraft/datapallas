import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, bpInvoice, bpCustomer } from "@/lib/db";
import { updateInvoice } from "@/lib/actions";
import { InvoiceForm } from "@/components/billing/InvoiceForm";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = db.select().from(bpInvoice).where(eq(bpInvoice.id, Number(id))).all()[0];
  if (!inv) return <div className="max-w-2xl mx-auto"><div className="alert alert-soft alert-error">Invoice not found.</div></div>;
  const cust = db.select().from(bpCustomer).where(eq(bpCustomer.id, inv.customerId)).all()[0];
  const customerName = cust ? `${cust.name} (${cust.email})` : "";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Edit {inv.invoiceNumber}</h1>
        <Link href={`/admin/invoices/${inv.id}`} className="btn btn-ghost btn-sm">Cancel</Link>
      </div>
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <form action={updateInvoice}>
            <input type="hidden" name="id" value={inv.id} />
            <InvoiceForm invoice={inv} customerName={customerName} />
            <div className="flex justify-end gap-2 mt-4">
              <Link href={`/admin/invoices/${inv.id}`} className="btn btn-ghost">Cancel</Link>
              <button id="btn-save-invoice" type="submit" className="btn btn-primary">Save changes</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
