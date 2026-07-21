import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, bpInvoice, bpCustomer, bpInvoiceLine } from "@/lib/db";
import { InvoiceDoc } from "@/components/billing/InvoiceDoc";
import { deleteInvoice, markInvoicePaid } from "@/lib/actions";
import { DeleteInvoiceButton, DeleteInvoiceModal } from "@/components/billing/DeleteInvoice";

export default async function AdminInvoiceShow({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = db.select().from(bpInvoice).where(eq(bpInvoice.id, Number(id))).all()[0];
  if (!inv) return <div className="max-w-3xl mx-auto"><div className="alert alert-soft alert-error">Invoice not found.</div></div>;
  const customer = db.select().from(bpCustomer).where(eq(bpCustomer.id, inv.customerId)).all()[0];
  const lines = db.select().from(bpInvoiceLine).where(eq(bpInvoiceLine.invoiceId, inv.id)).all();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <Link href="/admin/invoices" className="btn btn-ghost btn-sm">← Invoices</Link>
        <div className="flex gap-2">
          <Link href={`/admin/invoices/${inv.id}/edit`} className="btn btn-outline btn-sm">Edit</Link>
          {inv.status !== "PAID" ? (
            <form action={markInvoicePaid}>
              <input type="hidden" name="id" value={inv.id} />
              <button type="submit" className="btn btn-success btn-sm">Mark paid</button>
            </form>
          ) : null}
          {/* Was a bare submit: one click and the invoice and its lines were gone. Deleting is
              irreversible, so it goes through the same confirmation as the list. */}
          <DeleteInvoiceButton invoiceId={inv.id} invoiceNumber={inv.invoiceNumber}
                               className="btn btn-error btn-outline btn-sm" />
        </div>
      </div>
      <InvoiceDoc invoice={inv} customer={customer} lines={lines} />

      <DeleteInvoiceModal action={deleteInvoice} />
    </div>
  );
}
