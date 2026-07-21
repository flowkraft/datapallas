import Link from "next/link";
import { getSession } from "@/lib/auth";
import { invoiceForSession, invoiceDocumentParts } from "@/lib/db/scoped";
import { InvoiceDoc } from "@/components/billing/InvoiceDoc";

export default async function PortalInvoiceShow({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Scoped read: the ownership test rides in the WHERE clause, so someone else's invoice is never
  // fetched at all and there is no row here to leak by accident. The 1:1 mirror of the Grails twin's
  // PortalInvoiceController.show → ownInvoice(id).
  const inv = invoiceForSession(Number(id), await getSession());

  // The SAME answer for "no such invoice" and for "not yours" — anything else makes this page an
  // oracle that tells a stranger walking id=1..N which invoices exist.
  if (!inv) {
    return (
      <div className="max-w-3xl mx-auto">
        <div id="invoice-not-found" className="alert alert-soft alert-error">Invoice not found.</div>
      </div>
    );
  }
  const { customer, lines } = invoiceDocumentParts(inv);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <Link href="/portal/invoices" className="btn btn-ghost btn-sm">← My Invoices</Link>
        {inv.status !== "PAID"
          ? <Link href={`/portal/invoices/${inv.id}/pay`} className="btn btn-primary btn-sm">Pay Now</Link>
          : <span className="badge badge-soft badge-success badge-lg">Paid</span>}
      </div>
      <InvoiceDoc invoice={inv} customer={customer} lines={lines} />
    </div>
  );
}
